/**
 * 用 synonym-testset.json 量化 LLM judge 的準確度。
 *
 * 透過 `judgeByLLM` 派遣（生產用 Gemini）。
 *
 * 環境變數
 *   EVAL_TESTSET        testset JSON 路徑（預設 round6 子集，13K 太大）
 *   EVAL_LIMIT          抽樣多少 case（預設 50）
 *   EVAL_SEED           隨機種子，重現用（預設 42）
 *   EVAL_STRATIFIED     'true' (default) / 'false' — 是否平衡 accepted/rejected
 *   EVAL_SAVE_FAILURES  'true' (default) / 'false' — 是否輸出失敗案例 JSON
 *   EVAL_USE_FORMAT     'true' / 'false' (default) — 是否走 prod `deepEquals` 流程：
 *                       先 answerFormatter.format() 比對，相同 → 判 true 不打 LLM；
 *                       不同 → 才送 LLM。這個模式才真正反映 production 行為。
 *   EVAL_LLM_DELAY_MS   每次 LLM 呼叫前的間隔節流（ms）。Gemini 免費層 RPM 很低
 *                       （~10 RPM），設 6500 可穩過；預設 0。
 *   EVAL_LLM_RETRIES    遇 429（rate limit）時的重試次數，指數退避。預設 5。
 *
 * 例子
 *   # 預設 50 case，純 LLM 模式（raw answers 直接送 LLM）
 *   node libs/dataProcessing/evaluateSynonymTestSet.js
 *
 *   # 加上 format 預處理（= production deepEquals 流程）
 *   EVAL_USE_FORMAT=true node libs/dataProcessing/evaluateSynonymTestSet.js
 *
 *   # 跑完整 round6 (1840 case)
 *   EVAL_LIMIT=1840 EVAL_USE_FORMAT=true \
 *       node libs/dataProcessing/evaluateSynonymTestSet.js
 */

const fs = require('fs')
const path = require('path')
const apis = require('../api')
const formatters = require('../../../src/libs/formatters')
const srcApi = require('../../../src/libs/api')

const TMPDIR = path.resolve(__dirname, '..', '..', 'tmp')
const DEFAULT_TESTSET = path.join(TMPDIR, 'synonym-testset', 'synonym-testset-round6.json')

function parseArgs() {
  return {
    testsetPath: process.env.EVAL_TESTSET || DEFAULT_TESTSET,
    limit: parseInt(process.env.EVAL_LIMIT) || 50,
    seed: parseInt(process.env.EVAL_SEED) || 42,
    stratified: process.env.EVAL_STRATIFIED !== 'false',
    saveFailures: process.env.EVAL_SAVE_FAILURES !== 'false',
    useFormat: process.env.EVAL_USE_FORMAT === 'true',
    llmDelayMs: parseInt(process.env.EVAL_LLM_DELAY_MS) || 0,
    llmRetries: process.env.EVAL_LLM_RETRIES !== undefined
      ? parseInt(process.env.EVAL_LLM_RETRIES)
      : 5
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// 包一層：呼叫間節流 + 遇 429 指數退避重試。
// api.js 在 rate limit 時會 throw { status: 429, ... }。
async function judgeWithRetry(a1, a2, stem, { delayMs, retries }) {
  if (delayMs > 0) await sleep(delayMs)
  let attempt = 0
  for (;;) {
    try {
      return await apis.judgeByLLM(a1, a2, stem)
    } catch (e) {
      const is429 = e && (e.status === 429 || /rate limit/i.test(e.message || ''))
      if (!is429 || attempt >= retries) throw e
      // 指數退避：8s, 16s, 32s ... 讓 RPM 視窗回復
      const backoff = 8000 * Math.pow(2, attempt)
      attempt++
      console.log(`  429 rate limit, 退避 ${backoff / 1000}s 後重試 (第 ${attempt}/${retries} 次)`)
      await sleep(backoff)
    }
  }
}

async function buildAnswerFormatter() {
  const matchTable = await srcApi.getMatchTable()
  if (!matchTable) {
    throw new Error('Failed to load matchTable from S3 (check network / ITEMBANK_ITEM_S3_ENDPOINT)')
  }
  const af = {
    matchTable,
    format(answer) {
      let result = String(answer)
      for (let i = 0; i < formatters.length; i++) {
        result = formatters[i](result, af)
      }
      return result
    }
  }
  return af
}

// 決定性 LCG，方便重現
function makeRng(seed) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function shuffle(arr, rng) {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function stratifiedSample(cases, n, rng) {
  const accepted = cases.filter(c => c.expected === 'accepted')
  const rejected = cases.filter(c => c.expected === 'rejected')
  const halfAccepted = Math.min(Math.floor(n / 2), accepted.length)
  const halfRejected = Math.min(n - halfAccepted, rejected.length)
  const out = [
    ...shuffle(accepted, rng).slice(0, halfAccepted),
    ...shuffle(rejected, rng).slice(0, halfRejected)
  ]
  return shuffle(out, rng)
}

function pad(s, n) {
  return String(s).padStart(n)
}

function fmtPct(x) {
  return `${(x * 100).toFixed(2)}%`
}

async function main() {
  const args = parseArgs()
  const provider = 'gemini'
  const modelName = 'gemini'

  console.log(`Reading: ${args.testsetPath}`)
  const data = JSON.parse(fs.readFileSync(args.testsetPath, 'utf-8'))
  const cases = data.cases || []
  const totalAccepted = cases.filter(c => c.expected === 'accepted').length
  const totalRejected = cases.filter(c => c.expected === 'rejected').length
  console.log(`Testset: ${cases.length} cases (accepted=${totalAccepted}, rejected=${totalRejected})`)

  const rng = makeRng(args.seed)
  const sample = args.stratified
    ? stratifiedSample(cases, args.limit, rng)
    : shuffle(cases, rng).slice(0, args.limit)
  const sampleAcc = sample.filter(c => c.expected === 'accepted').length
  const sampleRej = sample.filter(c => c.expected === 'rejected').length
  console.log(
    `Sample : ${sample.length} cases ` +
    `(accepted=${sampleAcc}, rejected=${sampleRej}, stratified=${args.stratified}, seed=${args.seed})`
  )
  console.log(`LLM    : ${provider} (${modelName})`)
  console.log(`Mode   : ${args.useFormat ? 'format-then-llm (production deepEquals flow)' : 'raw llm only'}`)

  let answerFormatter = null
  if (args.useFormat) {
    console.log('Loading matchTable from S3...')
    answerFormatter = await buildAnswerFormatter()
    console.log(
      `MatchTable: fullMatch=${answerFormatter.matchTable.fullMatch?.length || 0}, ` +
      `partialMatch=${answerFormatter.matchTable.partialMatch?.length || 0}`
    )
  }
  console.log('')

  let tp = 0, fp = 0, tn = 0, fn = 0, errors = 0
  let formatHits = 0, llmCalls = 0
  // 按方法拆 TP/FP/TN/FN，方便看 format vs LLM 各自的貢獻
  const byMethod = {
    format: { tp: 0, fp: 0, tn: 0, fn: 0 },
    llm:    { tp: 0, fp: 0, tn: 0, fn: 0 }
  }
  const failures = []
  const startedAt = Date.now()

  for (let i = 0; i < sample.length; i++) {
    const c = sample[i]
    const { correctAnswer, userAnswer, expected } = c
    const expectedTrue = expected === 'accepted'
    let predicted = null
    let method = null
    let errMsg = null

    // Stage 1: format-based equivalence (production deepEquals fast path)
    if (answerFormatter) {
      try {
        const fa = answerFormatter.format(correctAnswer)
        const fb = answerFormatter.format(userAnswer)
        if (fa === fb) {
          predicted = true
          method = 'format'
          formatHits++
        }
      } catch (e) {
        // formatter 不該整批失敗；逐 case 失敗 log 並退化到 LLM
        console.error(`format failed for case ${c.id}: ${e.message}`)
      }
    }

    // Stage 2: LLM tiebreak — 把題幹一起送進去（B 改動），讓 LLM 看到上下文。
    // 節流 + 429 退避重試（Gemini 免費層 RPM 很低時必需）。
    if (predicted === null) {
      try {
        predicted = await judgeWithRetry(
          correctAnswer, userAnswer, c.context?.stem,
          { delayMs: args.llmDelayMs, retries: args.llmRetries }
        )
        method = 'llm'
        llmCalls++
      } catch (e) {
        errors++
        errMsg = e?.message || String(e)
        method = 'llm-error'
      }
    }

    // Classify and bucket
    if (predicted === null) {
      failures.push({ ...c, predicted: null, method, error: errMsg })
    } else if (predicted && expectedTrue) {
      tp++
      if (byMethod[method]) byMethod[method].tp++
    } else if (predicted && !expectedTrue) {
      fp++
      if (byMethod[method]) byMethod[method].fp++
      failures.push({ ...c, predicted, method, error: null })
    } else if (!predicted && expectedTrue) {
      fn++
      if (byMethod[method]) byMethod[method].fn++
      failures.push({ ...c, predicted, method, error: null })
    } else {
      tn++
      if (byMethod[method]) byMethod[method].tn++
    }

    if ((i + 1) % 5 === 0 || i === sample.length - 1) {
      const elapsed = (Date.now() - startedAt) / 1000
      const rate = (i + 1) / elapsed
      const eta = rate > 0 ? (sample.length - i - 1) / rate : 0
      console.log(
        `[${pad(i + 1, 4)}/${sample.length}] ` +
        `TP=${pad(tp, 3)} FP=${pad(fp, 3)} TN=${pad(tn, 3)} FN=${pad(fn, 3)} err=${pad(errors, 2)}  ` +
        `fmt=${pad(formatHits, 3)} llm=${pad(llmCalls, 3)}  ` +
        `${elapsed.toFixed(0)}s elapsed, eta ${eta.toFixed(0)}s`
      )
    }
  }

  const total = tp + fp + tn + fn
  const accuracy = total ? (tp + tn) / total : 0
  const precision = (tp + fp) ? tp / (tp + fp) : 0
  const recall = (tp + fn) ? tp / (tp + fn) : 0
  const specificity = (tn + fp) ? tn / (tn + fp) : 0
  const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0

  console.log('\n=== Confusion matrix ===')
  console.log('                  predicted accept   predicted reject')
  console.log(`expected accept   ${pad(tp, 16)}   ${pad(fn, 16)}`)
  console.log(`expected reject   ${pad(fp, 16)}   ${pad(tn, 16)}`)

  console.log('\n=== Metrics ===')
  console.log(`accuracy:    ${fmtPct(accuracy).padStart(7)}  (${tp + tn}/${total})`)
  console.log(`precision:   ${fmtPct(precision).padStart(7)}  TP=${tp} FP=${fp}`)
  console.log(`recall:      ${fmtPct(recall).padStart(7)}  TP=${tp} FN=${fn}    抓到的同義 case 比例`)
  console.log(`specificity: ${fmtPct(specificity).padStart(7)}  TN=${tn} FP=${fp}    拒掉的不等價 case 比例`)
  console.log(`F1:          ${fmtPct(f1).padStart(7)}`)
  console.log(`errors:      ${pad(errors, 7)}`)
  console.log(`wall time:   ${((Date.now() - startedAt) / 1000).toFixed(1)}s ` +
              `(avg ${(((Date.now() - startedAt) / 1000) / Math.max(1, sample.length)).toFixed(2)}s/case)`)

  if (args.useFormat) {
    console.log('\n=== Breakdown by method ===')
    console.log(`format-resolved: ${formatHits} (${fmtPct(formatHits / Math.max(1, sample.length))})`)
    console.log(`  TP=${byMethod.format.tp} FP=${byMethod.format.fp} TN=${byMethod.format.tn} FN=${byMethod.format.fn}`)
    console.log(`llm-resolved   : ${llmCalls} (${fmtPct(llmCalls / Math.max(1, sample.length))})`)
    console.log(`  TP=${byMethod.llm.tp} FP=${byMethod.llm.fp} TN=${byMethod.llm.tn} FN=${byMethod.llm.fn}`)
  }

  if (args.saveFailures && failures.length > 0) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const failPath = path.join(TMPDIR, `synonym-eval-${provider}-${ts}.json`)
    fs.writeFileSync(failPath, JSON.stringify({
      llmProvider: provider,
      model: modelName,
      useFormat: args.useFormat,
      seed: args.seed,
      sampleSize: sample.length,
      formatHits,
      llmCalls,
      metrics: { accuracy, precision, recall, specificity, f1, tp, fp, tn, fn, errors },
      byMethod,
      failures
    }, null, 2))
    console.log(`\nFailures (${failures.length}) saved to: ${failPath}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })

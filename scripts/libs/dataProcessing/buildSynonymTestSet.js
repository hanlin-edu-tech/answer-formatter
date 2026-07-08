const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const https = require('https')

const DEFAULT_TMP_DIR = path.resolve(process.cwd(), 'tmp')
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'tmp', 'synonym-testset', 'synonym-testset.json')
const DEFAULT_CACHE_DIR = path.resolve(process.cwd(), 'tmp', 'item-cache')
const DEFAULT_CONCURRENCY = 16
const DEFAULT_ITEM_BASE_URL = 'https://itembank.s3.ap-southeast-1.amazonaws.com/v1/items'

function parseArgs(argv) {
  const options = {
    tmpDir: DEFAULT_TMP_DIR,
    output: DEFAULT_OUTPUT,
    cacheDir: DEFAULT_CACHE_DIR,
    concurrency: DEFAULT_CONCURRENCY,
    itemBaseUrl: DEFAULT_ITEM_BASE_URL,
    round: null,
    dirPattern: 'synonym-preprocessed-full-applied-top1000',
    refresh: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]
    if (arg === '--tmp-dir' && next) { options.tmpDir = path.resolve(process.cwd(), next); i += 1 }
    else if (arg === '--output' && next) { options.output = path.resolve(process.cwd(), next); i += 1 }
    else if (arg === '--cache-dir' && next) { options.cacheDir = path.resolve(process.cwd(), next); i += 1 }
    else if (arg === '--concurrency' && next) { options.concurrency = Number(next); i += 1 }
    else if (arg === '--item-base-url' && next) { options.itemBaseUrl = next; i += 1 }
    else if (arg === '--round' && next) { options.round = next; i += 1 }
    else if (arg === '--dir-pattern' && next) { options.dirPattern = next; i += 1 }
    else if (arg === '--refresh') { options.refresh = true }
  }

  return options
}

function buildPairKey({ itemId, questionIndex, answerIndex, correctAnswer, userAnswer }) {
  return [itemId, questionIndex, answerIndex, correctAnswer, userAnswer].join('|')
}

function listRoundDirs(tmpDir, dirPattern, roundFilter) {
  const entries = fs.readdirSync(tmpDir, { withFileTypes: true })
  const dirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(dirPattern))
    .map((entry) => entry.name)
    .sort()

  if (!roundFilter) return dirs

  return dirs.filter((name) => {
    if (name === roundFilter) return true
    if (name.endsWith(`-${roundFilter}`)) return true
    return false
  })
}

function readNdjsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return []
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  const rows = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    rows.push(JSON.parse(trimmed))
  }
  return rows
}

function collectFromReviewDecisions(tmpDir, dirPattern, roundFilter) {
  const dirs = listRoundDirs(tmpDir, dirPattern, roundFilter)
  if (dirs.length === 0) {
    throw new Error(`No round directories matched in ${tmpDir} with pattern ${dirPattern}`)
  }

  const accepted = new Map()
  const rejected = new Map()
  const rawCounts = { acceptedRows: 0, rejectedRows: 0 }

  for (const dirName of dirs) {
    const baseDir = path.join(tmpDir, dirName)
    const acceptedRows = readNdjsonIfExists(path.join(baseDir, 'accepted.from-review.ndjson'))
    const rejectedRows = readNdjsonIfExists(path.join(baseDir, 'rejected.from-review.ndjson'))
    rawCounts.acceptedRows += acceptedRows.length
    rawCounts.rejectedRows += rejectedRows.length

    for (const row of acceptedRows) registerRow(accepted, row, dirName, 'accepted')
    for (const row of rejectedRows) registerRow(rejected, row, dirName, 'rejected')
  }

  return { accepted, rejected, dirs, rawCounts }
}

function registerRow(map, row, dirName, label) {
  const key = buildPairKey(row)
  const existing = map.get(key)
  if (existing) {
    existing.occurrenceCount += 1
    if (!existing.rounds.includes(dirName)) existing.rounds.push(dirName)
    return
  }

  map.set(key, {
    pairKey: key,
    itemId: row.itemId,
    questionIndex: row.questionIndex,
    answerIndex: row.answerIndex,
    correctAnswer: row.correctAnswer,
    userAnswer: row.userAnswer,
    expected: label,
    decision: {
      pairDecisionId: row.pairDecisionId ?? null,
      reason: row.pairDecisionReason ?? null,
      confidence: row.pairDecisionConfidence ?? null,
    },
    ruleReason: row.ruleReason ?? null,
    rounds: [dirName],
    occurrenceCount: 1,
  })
}

function getCachePath(cacheDir, itemId) {
  return path.join(cacheDir, `${itemId}.json`)
}

async function readCache(cacheDir, itemId) {
  const cachePath = getCachePath(cacheDir, itemId)
  try {
    const raw = await fsp.readFile(cachePath, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

async function writeCache(cacheDir, itemId, payload) {
  const cachePath = getCachePath(cacheDir, itemId)
  await fsp.mkdir(cacheDir, { recursive: true })
  await fsp.writeFile(cachePath, JSON.stringify(payload), 'utf8')
}

function fetchJson(url, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode || 0
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if (status === 200) {
          try {
            resolve({ status, json: JSON.parse(body) })
          } catch (parseErr) {
            reject(new Error(`Invalid JSON from ${url}: ${parseErr.message}`))
          }
          return
        }
        if (status === 403 || status === 404) {
          resolve({ status, json: null })
          return
        }
        reject(new Error(`Unexpected status ${status} from ${url}`))
      })
      res.on('error', reject)
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout: ${url}`))
    })
    req.on('error', reject)
  })
}

async function fetchItemWithRetry(itemBaseUrl, itemId, attempts = 3) {
  const url = `${itemBaseUrl}/${itemId}/item.json`
  let lastError = null
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fetchJson(url)
    } catch (err) {
      lastError = err
      const backoffMs = 200 * Math.pow(2, i)
      await new Promise((r) => setTimeout(r, backoffMs))
    }
  }
  throw lastError
}

async function runWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0
  let completed = 0
  const total = items.length

  async function next() {
    while (true) {
      const idx = cursor
      cursor += 1
      if (idx >= total) return
      try {
        results[idx] = await worker(items[idx], idx)
      } catch (err) {
        results[idx] = { error: err }
      }
      completed += 1
      if (completed % 200 === 0 || completed === total) {
        process.stderr.write(`  fetched ${completed}/${total}\n`)
      }
    }
  }

  const runners = []
  for (let i = 0; i < Math.min(concurrency, total); i += 1) runners.push(next())
  await Promise.all(runners)
  return results
}

function extractContext(itemJson, questionIndex, answerIndex) {
  const content = itemJson?.content
  if (!content) return { missing: true, reason: 'no-content' }

  const questions = content.questions || []
  const question = questions[questionIndex]
  if (!question) return { missing: true, reason: 'question-index-out-of-range' }

  const answers = Array.isArray(question.answers) ? question.answers : []
  const slot = answers[answerIndex]
  const slotAnswers = Array.isArray(slot) ? slot : (slot != null ? [slot] : [])

  const questionMeta = Array.isArray(itemJson.questions) ? itemJson.questions[questionIndex] : null

  return {
    preamble: content.preamble ?? null,
    stem: question.stem ?? null,
    solution: question.solution ?? null,
    answers: slotAnswers,
    allAnswers: answers,
    proposeAnswers: Array.isArray(question.proposeAnswers) ? question.proposeAnswers : [],
    supplementals: question.supplementals ?? {},
    optionFirstLetter: question.optionFirstLetter ?? null,
    answeringMethod: questionMeta?.answeringMethod ?? null,
    subjectIds: Array.isArray(itemJson.subjectIds) ? itemJson.subjectIds : [],
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  process.stderr.write(`Collecting from-review decisions from ${options.tmpDir} (pattern: ${options.dirPattern}${options.round ? `, round: ${options.round}` : ''})\n`)

  const { accepted, rejected, dirs, rawCounts } = collectFromReviewDecisions(
    options.tmpDir,
    options.dirPattern,
    options.round,
  )

  process.stderr.write(`Scanned ${dirs.length} round dir(s): ${dirs.join(', ')}\n`)
  process.stderr.write(`Raw rows: accepted=${rawCounts.acceptedRows}, rejected=${rawCounts.rejectedRows}\n`)
  process.stderr.write(`Unique pairs: accepted=${accepted.size}, rejected=${rejected.size}\n`)

  const allCases = [...accepted.values(), ...rejected.values()]
  const itemIds = Array.from(new Set(allCases.map((c) => c.itemId)))
  process.stderr.write(`Fetching ${itemIds.length} unique items (concurrency=${options.concurrency})\n`)

  await fsp.mkdir(options.cacheDir, { recursive: true })

  let cacheHits = 0
  let fetchedCount = 0
  let missingCount = 0
  const fetchErrors = []

  const itemMap = new Map()

  await runWithConcurrency(itemIds, options.concurrency, async (itemId) => {
    if (!options.refresh) {
      const cached = await readCache(options.cacheDir, itemId)
      if (cached) {
        cacheHits += 1
        itemMap.set(itemId, cached)
        return
      }
    }
    try {
      const { status, json } = await fetchItemWithRetry(options.itemBaseUrl, itemId)
      const payload = { fetchedAt: new Date().toISOString(), status, json }
      await writeCache(options.cacheDir, itemId, payload)
      fetchedCount += 1
      if (!json) missingCount += 1
      itemMap.set(itemId, payload)
    } catch (err) {
      fetchErrors.push({ itemId, error: err.message })
    }
  })

  process.stderr.write(`Cache hits: ${cacheHits}, network fetches: ${fetchedCount}, missing items: ${missingCount}, errors: ${fetchErrors.length}\n`)

  let slotMissingCount = 0
  let contextMissingCount = 0
  const cases = allCases.map((entry) => {
    const cached = itemMap.get(entry.itemId)
    const itemJson = cached?.json ?? null

    let context
    if (!itemJson) {
      context = { missing: true, reason: cached ? 'item-not-found' : 'fetch-failed' }
      contextMissingCount += 1
    } else {
      context = extractContext(itemJson, entry.questionIndex, entry.answerIndex)
      if (context.missing) slotMissingCount += 1
    }

    return {
      id: entry.pairKey,
      itemId: entry.itemId,
      questionIndex: entry.questionIndex,
      answerIndex: entry.answerIndex,
      context,
      correctAnswer: entry.correctAnswer,
      userAnswer: entry.userAnswer,
      expected: entry.expected,
      decision: entry.decision,
      ruleReason: entry.ruleReason,
      rounds: entry.rounds,
      occurrenceCount: entry.occurrenceCount,
    }
  })

  cases.sort((a, b) => {
    if (a.expected !== b.expected) return a.expected === 'accepted' ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const summary = {
    generatedAt: new Date().toISOString(),
    source: {
      tmpDir: options.tmpDir,
      dirPattern: options.dirPattern,
      round: options.round,
      scannedDirs: dirs,
      itemBaseUrl: options.itemBaseUrl,
    },
    totals: {
      rawRows: rawCounts.acceptedRows + rawCounts.rejectedRows,
      rawAccepted: rawCounts.acceptedRows,
      rawRejected: rawCounts.rejectedRows,
      uniqueAccepted: accepted.size,
      uniqueRejected: rejected.size,
      uniqueCases: cases.length,
      uniqueItems: itemIds.length,
      cacheHits,
      networkFetches: fetchedCount,
      missingItems: missingCount,
      contextMissing: contextMissingCount,
      slotMissing: slotMissingCount,
      fetchErrors: fetchErrors.length,
    },
    fetchErrors,
  }

  await fsp.mkdir(path.dirname(options.output), { recursive: true })
  await fsp.writeFile(options.output, `${JSON.stringify({ summary, cases }, null, 2)}\n`, 'utf8')

  const summaryPath = options.output.replace(/\.json$/, '.summary.json')
  await fsp.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

  process.stderr.write(`\nWrote test set: ${options.output}\n`)
  process.stderr.write(`Wrote summary:  ${summaryPath}\n`)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

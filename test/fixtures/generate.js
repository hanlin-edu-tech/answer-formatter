/**
 * 產生 formatter 迴歸測試用的 fixture。
 *
 * 用途：調整 formatters 陣列順序（或修改任一 formatter）之前先跑此腳本建立基準，
 * 改動後再跑 `npm test`，即可精確看出哪些同義詞規則的行為被改變。
 *
 * 用法：
 *   node test/fixtures/generate.js            抓遠端表，更新兩份 fixture
 *   node test/fixtures/generate.js --offline  沿用既有 matchTable.json 快照，只重算基準
 *
 * 調整 formatter 後要更新基準時用 --offline，才不會把遠端表的無關變動一起帶進來。
 *
 * 產出：
 *   matchTable.json          - 遠端同義詞表快照，讓測試脫離網路
 *   formatBaseline.json      - 現行 formatter 順序下每個 matchText 的格式化結果
 *   equivalenceBaseline.json - 內建預設表（src/data/matchTable.json）與 expectedChanges.json
 *                              探針詞組的等價類，比對「哪些答案判定相等」
 *
 * 等價類基準要在改 formatter 或加規則「之前」產生；改完後跑 `npm test`，
 * 新增的相等必須能由 expectedChanges.json 解釋。確認差異都是預期中的之後才重建基準。
 */
const fs = require('fs')
const path = require('path')
const api = require('../../src/libs/api')
const formatters = require('../../src/libs/formatters')
const answerFormatter = require('../../src/answerFormatter')
const defaultTable = require('../../src/data/matchTable.json')
const { collectInputs, buildClasses } = require('./equivalence')

const OUT_DIR = __dirname

const buildEntries = (matchTable) => {
  answerFormatter.matchTable = matchTable
  const entries = []

  for (const kind of ['fullMatch', 'partialMatch']) {
    for (const { primeText = '', matchText = [] } of matchTable[kind] || []) {
      for (const input of [primeText, ...matchText]) {
        let output = null
        let error = null
        try {
          output = answerFormatter.format(input)
        } catch (err) {
          error = err.message
        }
        entries.push({
          kind,
          primeText,
          input,
          output,
          ...(error ? { error } : {}),
          // matchText 應與其 primeText 判定相等，這是規則實際生效的指標
          equalsPrime: error ? null : output === answerFormatter.format(primeText)
        })
      }
    }
  }
  return entries
}

const main = async () => {
  const offline = process.argv.includes('--offline')
  const matchTable = offline ? require('./matchTable.json') : await api.getMatchTable()
  if (!matchTable) {
    console.error('無法取得遠端同義詞表，中止')
    process.exit(1)
  }

  const entries = buildEntries(matchTable)
  const effective = entries.filter(e => e.equalsPrime === true).length
  const baseline = {
    formatterOrder: formatters.map(f => f.name),
    entryCount: entries.length,
    effectiveCount: effective,
    entries
  }

  answerFormatter.matchTable = defaultTable
  const inputs = collectInputs(defaultTable)
  const equivalence = { inputs, classes: buildClasses(answerFormatter, inputs) }
  fs.writeFileSync(path.join(OUT_DIR, 'equivalenceBaseline.json'), JSON.stringify(equivalence, null, 2) + '\n')

  offline ? null : fs.writeFileSync(path.join(OUT_DIR, 'matchTable.json'), JSON.stringify(matchTable, null, 2) + '\n')
  fs.writeFileSync(path.join(OUT_DIR, 'formatBaseline.json'), JSON.stringify(baseline, null, 2) + '\n')

  console.log(`formatter 順序: ${baseline.formatterOrder.join(' -> ')}`)
  console.log(`項目總數: ${entries.length}`)
  console.log(`規則生效數: ${effective} (matchText 與 primeText 判定相等)`)
  console.log(`等價類: ${equivalence.classes.length} 類 / ${inputs.length} 個輸入`)
  console.log(`格式化失敗: ${entries.filter(e => e.error).length}`)
}

main()

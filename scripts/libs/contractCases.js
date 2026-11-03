const { explainNotEqual } = require('./ruleEffect')

// 使用端送來的固定寫法：表上的列被停用或改掉時，使用端的判分會整批出錯，轉表者從表上看不出來（kb-1005668）。
// 目前只有 ms-check-answer 的選擇題（單選、多選、題組子題）拿固定寫法查對答表，判法是不帶科目的
// format() 相等（作答頁選擇題直接比字串，不用對答表；填充、選填題依題目內容，不是固定寫法），這裡照同樣判法檢查。
// 是非題改用 SDK 的 trueFalse()，不查對答表（kb-1006189），完整對答的 true／false 兩列不再是契約（kb-1006190）。
// 新的使用端依賴對答表某個對應時，在這裡加案例：answer 要等於 equal 的每個寫法、不等於 notEqual；unchanged 要原樣不變。
// usage、impact 寫給編輯看：使用端怎麼用、改壞了會怎樣
const CONTRACT_CASES = [
  {
    // 單選、題組子題比對兩邊 format() 後的選項編號；多選要求作答 format() 後原樣等於 "1"…"N"
    consumer: 'ms-check-answer 選擇題的選項編號',
    usage: '選擇題作答時會送選項編號「1」～「10」',
    impact: '多選題會整題判錯',
    unchanged: Array.from({ length: 10 }, (_, i) => String(i + 1))
  }
]

const __SHEETS = ['fullMatch', 'partialMatch', 'variantMatch']
const __values = values => values.map(value => `「${value}」`).join('')
const __MAX_SHOWN = 5
// 表上一列的稱呼，例：'第 12 列（false ← ╳、X、x）'
const __rowLabel = ({ rowNumber, primeText, matchText }) => {
  const shown = matchText.slice(0, __MAX_SHOWN).join('、') + (matchText.length > __MAX_SHOWN ? '…' : '')
  return `第 ${rowNumber} 列（${primeText === '' ? `刪掉 ${shown}` : `${primeText} ← ${shown}`}）`
}
// 有某個寫法（標準答案或輸入答案）的列，依完整、部分、異體寫法的順序找第一個
const __rowWithText = (sources, text) => {
  for (const sheet of __SHEETS) {
    const row = (sources[sheet] || []).find(({ primeText, matchText }) => primeText === text || matchText.includes(text))
    if (row) return { sheet, row }
  }
  return null
}
// explain() 回報的改寫對回表上的列（只找啟用的列；對不到的略過）
const __rowsOfTrace = (trace, sources) => {
  const hits = [
    ...(trace.variantMatch || []).filter(hit => !hit.reverted).map(hit => ['variantMatch', hit]),
    ...(trace.fullMatch?.hitBy === 'matchText' ? [['fullMatch', trace.fullMatch]] : []),
    ...(trace.partialMatch || []).filter(hit => !hit.reverted).map(hit => ['partialMatch', hit])
  ]
  return hits.map(([sheet, { primeText, matchedText }]) => {
    const candidates = (sources[sheet] || []).filter(row => row.enabled && row.primeText === primeText)
    const row = candidates.find(({ matchText }) => matchText.includes(matchedText)) || candidates[0]
    return row ? { sheet, row } : null
  }).filter(Boolean)
}
// 同一張分頁的列合併成一個位置，例：'第 3 列（…）、第 8 列（…）'；沒有列時回傳 null
const __locationOf = (found) => {
  if (!found.length) return null
  const sheet = found[0].sheet
  const rows = [...new Map(found.filter(item => item.sheet === sheet).map(({ row }) => [row.rowNumber, row])).values()]
  return { sheet, location: rows.map(__rowLabel).join('、') }
}

/**
 * @description 檢查即將上傳的表是否仍滿足使用端依賴的對應（判法同 ms-check-answer：不帶科目的 format() 相等）：
 * 使用端送的寫法要等於每個標準答案、不等於相反的答案（避免把整組改成全部相等）；選項編號要原樣不變。
 * 不符就讓 job 失敗、不上傳。每個不符的案例回報一個給編輯看的問題，指出是哪一列、為什麼不能改。
 * @param {object} sdk - answerFormatter SDK
 * @param {object} matchTable - 即將上傳的 matchTable.v2.json
 * @param {object[]} [cases] - 預設為 CONTRACT_CASES
 * @param {Object<string, object[]>} [sources] - 各對答分頁的所有規則列（見 parseMatchSheet 的 rows），用來指出列號；沒帶時不寫列號
 * @returns {{ sheet: string, location: string, text: string, detail?: string }[]} 給編輯看的問題（見 editorMessages）；detail 為處理過程，只寫進 log
 */
const checkContractCases = (sdk, matchTable = {}, cases = CONTRACT_CASES, sources = {}) => {
  const original = sdk.matchTable
  const problems = []
  const traceOf = text => typeof sdk.explain === 'function' ? sdk.explain(text) : {}
  try {
    sdk.matchTable = matchTable
    for (const { usage, impact, answer, equal = [], notEqual = [], unchanged = [] } of cases) {
      const missing = equal.filter(standard => sdk.format(answer) !== sdk.format(standard))
      if (missing.length) {
        const found = __rowWithText(sources, answer)
        const detail = missing.map(standard => explainNotEqual(sdk, matchTable, answer, standard)).filter(Boolean).join('\n')
        if (!found) {
          problems.push({ sheet: 'fullMatch', location: '', text: `找不到「${answer}」那一列，可能被刪掉了。${usage}，要靠這一列對到${__values(equal)}，否則${impact}。請加回這一列；不確定的話請找工程。`, detail })
        } else if (!found.row.enabled) {
          problems.push({ sheet: found.sheet, location: __rowLabel(found.row), text: `被停用了。${usage}，要靠這一列對到${__values(equal)}，否則${impact}。請把這一列的 enabled 勾回來。`, detail })
        } else {
          problems.push({ sheet: found.sheet, location: __rowLabel(found.row), text: `被改掉了，作答「${answer}」對不到${__values(missing)}。${usage}，這一列不能改，否則${impact}。請改回原本的內容；不確定的話請找工程。`, detail })
        }
      }
      for (const standard of notEqual) {
        if (sdk.format(answer) !== sdk.format(standard)) continue
        const at = __locationOf([...__rowsOfTrace(traceOf(answer), sources), ...__rowsOfTrace(traceOf(standard), sources)])
        problems.push({ sheet: at?.sheet || 'fullMatch', location: at?.location || '', text: `讓作答「${answer}」和標準答案「${standard}」被判成一樣。${usage}，這樣答錯也會判對。請檢查${at ? '這一列' : '對答表有沒有把兩者換成同一個寫法'}；不確定的話請找工程。` })
      }
      // 同一列改寫的選項編號合併成一則
      const rewritten = new Map()
      for (const value of unchanged) {
        const formatted = sdk.format(value)
        if (formatted === value) continue
        const at = __locationOf(__rowsOfTrace(traceOf(value), sources)) || { sheet: 'partialMatch', location: '' }
        const key = `${at.sheet}|${at.location}`
        if (!rewritten.has(key)) rewritten.set(key, { ...at, values: [], formatted: [] })
        rewritten.get(key).values.push(value)
        rewritten.get(key).formatted.push(formatted)
      }
      for (const { sheet, location, values, formatted } of rewritten.values()) {
        problems.push({
          sheet,
          location,
          text: `${location ? '把' : '有對答列把'}選項編號${__values(values)}改寫成${__values(formatted)}。${usage}，這些數字不能被改寫，否則${impact}。請刪掉或停用${location ? '這一列' : '這樣的列'}；不確定的話請找工程。`
        })
      }
    }
  } finally {
    sdk.matchTable = original
  }
  return problems
}

module.exports = { CONTRACT_CASES, checkContractCases }

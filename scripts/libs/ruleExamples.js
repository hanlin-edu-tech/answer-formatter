const { KEEP_SWITCHES, RULE_COLUMN, ID_COLUMN, ALL_SUBJECTS, EXAMPLE_COLUMNS, HEADER_KEYS, sheetHeader, headerProblem, ruleColumns, switchOf } = require('./formatterSettings')

// 「對答呈現」欄：輸入答案經過這條規則後預期的結果；不當成要比對的其他寫法
const OUTPUT_COLUMN = '對答呈現'
// 範例和開關放在同一張分頁（設定表）：預設、各科的開關欄不是範例
const SETTING_COLUMNS = [...ALL_SUBJECTS, ...Object.values(HEADER_KEYS).filter(title => ![RULE_COLUMN, ID_COLUMN, ...EXAMPLE_COLUMNS].includes(title))]
const __cell = (row, index) => (row?.[index] ?? '').toString()
const SUBJECT_SWITCHES = {
  outerQuoteOptional: '英文',
  outerBracketOptional: '國文',
  answerOrder: '國文',
  mathPlusMinus: '數學',
  mathFactorOrder: '數學'
}

// 開關所屬的 SDK formatter 步驟（explain().steps 的 formatter 名稱）；沒列的開關與 formatter 同名
const STEP_OF = {
  fullwidthAlnum: 'fullwidthFormatter',
  fullwidthComma: 'fullwidthFormatter',
  fullwidthBracket: 'fullwidthFormatter',
  fullwidthSlash: 'fullwidthFormatter',
  trimLeadingDigit: 'removeSpaceFormatter',
  trimLeadingHan: 'removeSpaceFormatter',
  trimLeadingLatin: 'removeSpaceFormatter',
  keepDigitSpace: 'removeSpaceFormatter',
  keepHanSpace: 'removeSpaceFormatter',
  keepLatinSpace: 'removeSpaceFormatter',
  removeDigitSpace: 'removeSpaceFormatter',
  removeHanSpace: 'removeSpaceFormatter',
  removeLatinSpace: 'removeSpaceFormatter',
  outerQuoteOptional: 'englishQuoteFormatter',
  outerBracketOptional: 'outerBracketFormatter'
}
// equals() 比對時才生效、不改寫答案的規則：對答呈現是「輸入答案會被判定等於的寫法」
const STRUCTURAL_SWITCHES = ['answerOrder', 'mathPlusMinus', 'mathFactorOrder']

/**
 * @description 檢查設定表分頁上的範例（範例欄和開關欄在同一張分頁，見 sheetHeader）。每一列是一條規則：「規則ID」欄
 * 決定是哪條規則（見 ruleColumns），規則名稱只用在訊息；開關欄（預設、各科）之外的欄位依序為標準寫法、其他寫法
 * （「對答呈現」欄除外）。整列沒有範例只列為警告。
 * 只打開這條規則（其他開關用 SDK 預設值，不受設定表勾選影響）時，其他寫法與標準寫法應判定相等；改名前的保留空白類規則
 * （KEEP_SWITCHES）開啟時應判定不相等。把規則關掉後結果不變的範例沒有展示到規則，只列為警告。
 * 有「對答呈現」欄時，另檢查輸入答案經過這條規則的結果（只看該規則的步驟，不含後面對答表等改寫）
 * 等於對答呈現；結構比對類規則（STRUCTURAL_SWITCHES）改檢查開啟時判定相等。對答呈現空白只列為警告。
 * @param {object} sdk - answerFormatter SDK（需支援 equals 與 matchTable 的 formatters 開關）
 * @param {object} matchTable - 即將上傳的 matchTable.v2.json
 * @param {string[][]} sheet
 * @returns {{ failures: string[], warnings: string[] }}
 */
const checkRuleExamples = (sdk, matchTable = {}, sheet = []) => {
  const failures = []
  const warnings = []
  if (!sheet.some(row => (row || []).some((_, i) => __cell(row, i).trim() !== ''))) return { failures, warnings }
  const parsed = sheetHeader(sheet)
  const problem = headerProblem(parsed)
  if (problem) return { failures: [`Rule examples sheet: ${problem}`], warnings }
  const { header, dataRows } = parsed
  const { nameIndex, idIndex, ruleOf } = ruleColumns(header)

  let skippedOutput = false
  const outputIndex = header.findIndex(cell => (cell ?? '').toString().trim() === OUTPUT_COLUMN)
  // 範例欄：扣掉規則名稱、規則ID、對答呈現、開關欄之外的欄位，依序為標準寫法、其他寫法
  const isExampleColumn = index => index !== nameIndex && index !== idIndex && index !== outputIndex &&
    !SETTING_COLUMNS.includes((header[index] ?? '').toString().trim())
  const original = sdk.matchTable
  // 每條規則的範例只看這條規則本身：其他開關一律用 SDK 預設值，不套用設定表的勾選，
  // 否則編輯關掉別條規則（例：數學「多個答案順序可互換」）就會讓不相干的範例失敗。
  // 對答表的規則列照常套用。SDK 依 matchTable 物件快取規則，每種開關組合各建一個物件
  const tables = {}
  const subjectFor = name => SUBJECT_SWITCHES[name]
  // 規則ID 與 SDK 開關不同名或勾選意思相反時（見 switchOf），換成 SDK 開關與開關值
  const tableWith = (name, enabled) => {
    const subject = subjectFor(name)
    const key = `${name}:${enabled}`
    if (!tables[key]) {
      const { formatters, subjects, ...rules } = matchTable
      const target = switchOf(name)
      const value = target.invert ? !enabled : enabled
      tables[key] = {
        ...rules,
        formatters: { [target.name]: value },
        ...(subject ? { subjects: { [subject]: { formatters: { [target.name]: value } } } } : {})
      }
    }
    return tables[key]
  }
  const judge = (name, enabled, a, b) => {
    sdk.matchTable = tableWith(name, enabled)
    const subject = subjectFor(name)
    return sdk.equals(a, b, subject ? { subject } : undefined)
  }
  // 規則開啟、不帶科目時該規則步驟的輸出。只在特定科目執行的步驟（例：英文引號）才帶該科。
  // 步驟沒有執行時回傳 undefined
  const outputOf = (name, input) => {
    sdk.matchTable = tableWith(name, true)
    const stepOf = options => sdk.explain(input, options).steps.find(s => s.formatter === (STEP_OF[name] || name) && s.enabled)
    const subject = subjectFor(name)
    return (stepOf() || (subject ? stepOf({ subject }) : undefined))?.after
  }

  try {
    dataRows.forEach(({ row, rowNumber }) => {
      const { name, label, id, problem, legacy, renamedTo } = ruleOf(row)
      if (legacy) {
        warnings.push(`規則表第 ${rowNumber} 列「${label}」（${id}）：${legacy}`)
        return
      }
      if (renamedTo) warnings.push(`規則表第 ${rowNumber} 列「${label}」（${id}）：請改用 ${renamedTo}，範例改成開啟時空白會去掉`)
      if (problem) {
        const message = {
          noId: label ? `「${label}」沒有填${ID_COLUMN}` : `沒有填${ID_COLUMN}`,
          unknownId: `不認得的${ID_COLUMN}「${id}」`
        }[problem]
        failures.push(`第 ${rowNumber} 列：${message}`)
        return
      }
      const examples = row.map((_, i) => i).filter(isExampleColumn).map(i => __cell(row, i))
      const standard = examples[0] ?? ''
      const others = examples.slice(1).filter(text => text.trim() !== '')
      // 開關和範例同一張分頁，還沒寫範例的規則不擋上傳
      if (standard.trim() === '' && !others.length) {
        warnings.push(`第 ${rowNumber} 列「${label}」：沒有範例`)
        return
      }
      if (!others.length) {
        failures.push(`第 ${rowNumber} 列「${label}」：沒有其他寫法`)
        return
      }
      const expectEqual = !KEEP_SWITCHES.includes(name)
      for (const other of others) {
        const on = judge(name, true, standard, other)
        if (on !== expectEqual) {
          failures.push(`第 ${rowNumber} 列「${label}」：「${standard}」與「${other}」開啟時應判定${expectEqual ? '相等' : '不相等'}，實際${on ? '相等' : '不相等'}`)
          continue
        }
        if (judge(name, false, standard, other) === on) {
          warnings.push(`第 ${rowNumber} 列「${label}」：「${standard}」與「${other}」關閉規則時結果相同，範例沒有展示到這條規則`)
        }
      }
      if (outputIndex === -1) return
      const expected = __cell(row, outputIndex)
      if (expected.trim() === '') {
        warnings.push(`第 ${rowNumber} 列「${label}」：沒有填對答呈現`)
        return
      }
      if (typeof sdk.explain !== 'function') {
        if (!skippedOutput) warnings.push('SDK 沒有 explain()，略過對答呈現檢查')
        skippedOutput = true
        return
      }
      for (const other of others) {
        if (STRUCTURAL_SWITCHES.includes(name)) {
          if (!judge(name, true, other, expected)) failures.push(`第 ${rowNumber} 列「${label}」：「${other}」開啟時應判定等於對答呈現「${expected}」，實際不相等`)
          continue
        }
        const actual = outputOf(name, other)
        if (actual !== expected) failures.push(`第 ${rowNumber} 列「${label}」：「${other}」經過規則後是「${actual ?? other}」，對答呈現填的是「${expected}」`)
      }
    })
  } finally {
    sdk.matchTable = original
  }
  return { failures, warnings }
}

module.exports = { STEP_OF, STRUCTURAL_SWITCHES, checkRuleExamples }

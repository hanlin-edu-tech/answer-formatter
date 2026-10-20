const { KEEP_SWITCHES, ID_COLUMN, sheetHeader, headerProblem, ruleColumns } = require('./formatterSettings')

// 「對答呈現」欄：輸入答案經過這條規則後預期的結果；不當成要比對的其他寫法
const OUTPUT_COLUMN = '對答呈現'
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
  fullwidthSpace: 'fullwidthFormatter',
  fullwidthComma: 'fullwidthFormatter',
  fullwidthBracket: 'fullwidthFormatter',
  fullwidthSlash: 'fullwidthFormatter',
  trimLeadingDigit: 'removeSpaceFormatter',
  trimLeadingHan: 'removeSpaceFormatter',
  trimLeadingLatin: 'removeSpaceFormatter',
  keepDigitSpace: 'removeSpaceFormatter',
  keepHanSpace: 'removeSpaceFormatter',
  keepLatinSpace: 'removeSpaceFormatter',
  outerQuoteOptional: 'englishQuoteFormatter',
  outerBracketOptional: 'outerBracketFormatter'
}
// equals() 比對時才生效、不改寫答案的規則：對答呈現是「輸入答案會被判定等於的寫法」
const STRUCTURAL_SWITCHES = ['answerOrder', 'mathPlusMinus', 'mathFactorOrder']

/**
 * @description 檢查「規則表」分頁的範例。表頭同設定表（見 sheetHeader）。每一列是一條規則的範例：「規則ID」欄
 * 決定是哪條規則（見 ruleColumns），規則名稱只用在訊息；其餘欄位依序為標準寫法、其他寫法（「對答呈現」欄除外）。
 * 在全科設定下把這條規則打開時，其他寫法與標準寫法應判定相等；保留空白類的規則
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
  // 範例欄：扣掉規則名稱、規則ID、對答呈現之外的欄位，依序為標準寫法、其他寫法
  const isExampleColumn = index => index !== nameIndex && index !== idIndex && index !== outputIndex
  const original = sdk.matchTable
  // SDK 依 matchTable 物件快取規則，每種開關組合各建一個物件
  const tables = {}
  const subjectFor = name => SUBJECT_SWITCHES[name]
  const tableWith = (name, enabled) => {
    const subject = subjectFor(name)
    const key = `${name}:${enabled}`
    if (!tables[key]) {
      const subjects = { ...(matchTable.subjects || {}) }
      if (subject) {
        subjects[subject] = {
          ...(subjects[subject] || {}),
          formatters: { ...(subjects[subject]?.formatters || {}), [name]: enabled }
        }
      }
      tables[key] = {
        ...matchTable,
        formatters: { ...(matchTable.formatters || {}), [name]: enabled },
        ...(subject ? { subjects } : {})
      }
    }
    return tables[key]
  }
  const judge = (name, enabled, a, b) => {
    sdk.matchTable = tableWith(name, enabled)
    const subject = subjectFor(name)
    return sdk.equals(a, b, subject ? { subject } : undefined)
  }
  // 規則開啟、不帶科目（全科預設開關）時該規則步驟的輸出；不帶科目是為了不讓該科其他開關
  // （例：國文大小寫互通）混進結果。只在特定科目執行的步驟（例：英文引號）才帶該科。
  // 步驟沒有執行時回傳 undefined
  const outputOf = (name, input) => {
    sdk.matchTable = tableWith(name, true)
    const stepOf = options => sdk.explain(input, options).steps.find(s => s.formatter === (STEP_OF[name] || name) && s.enabled)
    const subject = subjectFor(name)
    return (stepOf() || (subject ? stepOf({ subject }) : undefined))?.after
  }

  try {
    dataRows.forEach(({ row, rowNumber }) => {
      const { name, label, id, problem } = ruleOf(row)
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

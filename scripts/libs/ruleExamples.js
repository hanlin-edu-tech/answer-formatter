const { KEEP_SWITCHES, RULE_COLUMN, ID_COLUMN, ALL_SUBJECTS, EXAMPLE_COLUMNS, HEADER_KEYS, sheetHeader, headerProblems, ruleColumns, switchOf } = require('./formatterSettings')
const { cellOf, extraSpaceAt, quote, rowLabel } = require('./editorMessages')

// 對答表在提醒裡的名稱（試算表分頁名稱）
const MATCH_TABLES = { fullMatch: '完整答案對答', partialMatch: '部分答案對答' }
// 「對答呈現」欄：輸入答案經過這條規則後預期的結果；不當成要比對的其他寫法
const OUTPUT_COLUMN = '對答呈現'
// 範例和開關放在同一張分頁（設定表）：預設、各科的開關欄與備註欄不是範例
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
  fullwidthSpace: 'fullwidthFormatter',
  fullwidthComma: 'fullwidthFormatter',
  fullwidthBracket: 'fullwidthFormatter',
  fullwidthSymbol: 'fullwidthFormatter',
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
const STRUCTURAL_SWITCHES = ['answerOrder', 'mathPlusMinus', 'mathFactorOrder', 'separatorOptional']

/**
 * @description 檢查設定表分頁上的範例（範例欄和開關欄在同一張分頁，見 sheetHeader）。每一列是一條規則：「規則ID」欄
 * 決定是哪條規則（見 ruleColumns），規則名稱只用在訊息；開關欄（預設、各科）之外的欄位依序為標準寫法、其他寫法
 * （「對答呈現」欄除外）。整列沒有範例只列為警告。
 * 只打開這條規則（其他開關用 SDK 預設值，不受設定表勾選影響）時，其他寫法與標準寫法應判定相等；改名前的保留空白類規則
 * （KEEP_SWITCHES）開啟時應判定不相等。把規則關掉後結果不變的範例沒有展示到規則，只列為警告。
 * 有「對答呈現」欄時，另檢查輸入答案經過這條規則的結果（只看該規則的步驟，不含後面對答表等改寫）
 * 等於對答呈現；結構比對類規則（STRUCTURAL_SWITCHES）改檢查開啟時判定相等。對答呈現空白只列為警告。
 * 表頭有問題、規則ID 沒填或不認得的列由設定解析（parseFormatterSettings）回報，這裡略過，同一個問題不列兩次。
 * @param {object} sdk - answerFormatter SDK（需支援 equals 與 matchTable 的 formatters 開關）
 * @param {object} matchTable - 即將上傳的 matchTable.v2.json
 * @param {string[][]} sheet
 * @returns {{ failures: { sheet: string, location: string, text: string }[], warnings: string[] }} failures 為給編輯看的問題（見 editorMessages）
 */
const checkRuleExamples = (sdk, matchTable = {}, sheet = []) => {
  const failures = []
  const warnings = []
  if (!sheet.some(row => (row || []).some((_, i) => __cell(row, i).trim() !== ''))) return { failures, warnings }
  const parsed = sheetHeader(sheet)
  if (headerProblems(parsed).length) return { failures, warnings }
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
  // 規則關閉時，標準寫法或其他寫法被對答表改寫的列（explain() 命中且沒有還原的）。
  // 這些列會把兩種寫法換成一樣，開關切換看不出差異（例：部分答案對答「,」←「，」蓋掉全形逗號開關）
  const tableHitsOf = (name, texts) => {
    if (typeof sdk.explain !== 'function') return []
    sdk.matchTable = tableWith(name, false)
    const subject = subjectFor(name)
    const hits = texts.flatMap(text => {
      const trace = sdk.explain(text, subject ? { subject } : undefined)
      return [
        ...(trace.fullMatch && !trace.fullMatch.reverted ? [[MATCH_TABLES.fullMatch, trace.fullMatch]] : []),
        ...(trace.partialMatch || []).filter(hit => !hit.reverted).map(hit => [MATCH_TABLES.partialMatch, hit])
      ].map(([table, { primeText, matchedText }]) => `${table}「${primeText}」←「${matchedText}」`)
    })
    return [...new Set(hits)]
  }
  // 規則開啟、不帶科目時該規則步驟的輸出。只在特定科目執行的步驟（例：英文引號）才帶該科。
  // 步驟沒有執行時回傳 undefined
  const outputOf = (name, input) => {
    sdk.matchTable = tableWith(name, true)
    const stepOf = options => sdk.explain(input, options).steps.find(s => s.formatter === (STEP_OF[name] || name) && s.enabled)
    const subject = subjectFor(name)
    return (stepOf() || (subject ? stepOf({ subject }) : undefined))?.after
  }

  // 範例欄的欄名（例：輸入答案）；欄位沒有表頭時用「其他寫法」
  const titleOf = index => (header[index] ?? '').toString().trim() || '其他寫法'
  const report = (location, text) => failures.push({ sheet: 'settings', location, text })

  try {
    dataRows.forEach(({ row, rowNumber }) => {
      const { name, label, problem, legacy } = ruleOf(row)
      // 規則改名／移除提醒、規則ID 的問題由設定解析統一產生；範例檢查只回報範例問題，避免同一列提醒兩次。
      if (legacy || problem) return
      const ruleName = rowLabel(rowNumber, label)
      const exampleIndexes = row.map((_, i) => i).filter(isExampleColumn)
      // 表頭有範例欄、這一列較短時，空白格也要算到（缺的範例要指出格子位置）
      header.forEach((_, i) => { if (i >= row.length && isExampleColumn(i)) exampleIndexes.push(i) })
      const standardIndex = exampleIndexes[0]
      const standard = standardIndex === undefined ? '' : __cell(row, standardIndex)
      const others = exampleIndexes.slice(1).map(index => ({ index, text: __cell(row, index) })).filter(({ text }) => text.trim() !== '')
      // 開關和範例同一張分頁，還沒寫範例的規則不擋上傳
      if (standard.trim() === '' && !others.length) {
        warnings.push(`設定表第 ${rowNumber} 列「${label}」：沒有範例`)
        return
      }
      if (!others.length) {
        const inputIndex = exampleIndexes[1]
        if (inputIndex === undefined) report(ruleName, '：有填標準寫法，但表上沒有輸入答案欄；請找工程。')
        else report(`${cellOf(inputIndex, rowNumber)}（${ruleName}的「${titleOf(inputIndex)}」）`, `是空的；有填${titleOf(standardIndex)}就要填${titleOf(inputIndex)}。`)
        return
      }
      const expectEqual = !KEEP_SWITCHES.includes(name)
      // 和標準寫法判定不對的輸入答案已經列出，不再檢查對答呈現，同一格不列兩次
      const failed = new Set()
      for (const { index, text: other } of others) {
        const on = judge(name, true, standard, other)
        if (on !== expectEqual) {
          failed.add(index)
          const cells = `${cellOf(standardIndex, rowNumber)}、${cellOf(index, rowNumber)}`
          report(ruleName, expectEqual
            ? `：${titleOf(index)}${quote(other)}照這條規則不會等於${titleOf(standardIndex)}${quote(standard)}，請檢查 ${cells}。`
            : `：${titleOf(index)}${quote(other)}照這條規則應該和${titleOf(standardIndex)}${quote(standard)}不一樣，實際卻判成一樣，請檢查 ${cells}。`)
          continue
        }
        if (judge(name, false, standard, other) === on) {
          const hits = tableHitsOf(name, [standard, other])
          warnings.push(hits.length
            ? `設定表第 ${rowNumber} 列「${label}」：「${standard}」與「${other}」關閉規則時結果相同，因為${hits.join('、')}已經把兩種寫法換成一樣，這條規則開或關都沒有差別；要讓規則生效，請刪掉對答表上的這個寫法`
            : `設定表第 ${rowNumber} 列「${label}」：「${standard}」與「${other}」關閉規則時結果相同，範例沒有展示到這條規則`)
        }
      }
      if (outputIndex === -1) return
      const expected = __cell(row, outputIndex)
      if (expected.trim() === '') {
        warnings.push(`設定表第 ${rowNumber} 列「${label}」：沒有填對答呈現`)
        return
      }
      if (typeof sdk.explain !== 'function') {
        if (!skippedOutput) warnings.push('SDK 沒有 explain()，略過對答呈現檢查')
        skippedOutput = true
        return
      }
      const outputCell = cellOf(outputIndex, rowNumber)
      const outputLocation = `${outputCell}（${ruleName}的「${OUTPUT_COLUMN}」）`
      for (const { index, text: other } of others.filter(({ index }) => !failed.has(index))) {
        if (STRUCTURAL_SWITCHES.includes(name)) {
          if (!judge(name, true, other, expected)) {
            report(outputLocation, `填的是${quote(expected)}，但${titleOf(index)}${quote(other)}照這條規則不會等於它，請檢查 ${cellOf(index, rowNumber)}、${outputCell}。`)
          }
          continue
        }
        // 步驟沒有執行（undefined）時一律算不符，訊息顯示原樣
        const output = outputOf(name, other)
        if (output === expected) continue
        const actual = output ?? other
        const extraSpace = extraSpaceAt(expected, actual)
        report(outputLocation, extraSpace
          ? `填的是${quote(expected)}，應該是${quote(actual)}，請刪掉${extraSpace}的空白。`
          : `填的是${quote(expected)}。${titleOf(index)}${quote(other)}照這條規則會變成${quote(actual)}，請把 ${outputCell} 改成${quote(actual)}。`)
      }
    })
  } finally {
    sdk.matchTable = original
  }
  return { failures, warnings }
}

module.exports = { STEP_OF, STRUCTURAL_SWITCHES, checkRuleExamples }

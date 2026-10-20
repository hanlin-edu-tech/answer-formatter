// 「設定表」分頁的規則名稱（沿用編輯規則表的說法）對應 SDK 的開關名稱；新增可切換的規則時兩邊要一起改
// （SDK 端見 src/libs/formatters.js 的 __DEFAULT_SWITCHES）。fullwidthFormatter、removeSpaceFormatter
// 是細項的總開關，不列在表上，一律照 SDK 預設開啟
const RULE_SWITCHES = {
  '英文、數字、冒號：半形、全形都可以過關': 'fullwidthAlnum',
  '空格：半形、全形都可以過關': 'fullwidthSpace',
  '答案最後有句號：寫、沒寫句號都可以過關': 'removeTailPeriodFormatter',
  '逗號：全形/半形都可以過關': 'fullwidthComma',
  '去逗號判斷': 'numberFormatter',
  '大小寫互通': 'caseFormatter',
  '括號全形半形互通': 'fullwidthBracket',
  '第一個數字前面會去空白': 'trimLeadingDigit',
  '數字中間不會去空白': 'keepDigitSpace',
  '第一個國字前面會去空白': 'trimLeadingHan',
  '國字中間不會去空白': 'keepHanSpace',
  '英文字前面會去空白': 'trimLeadingLatin',
  '英文字中間不會去空白': 'keepLatinSpace',
  '斜線全形半形互通': 'fullwidthSlash',
  '去題號': 'removeNumberingFormatter',
  'LaTeX 方程式轉成一般寫法': 'latexFormatter',
  '年代寫法互通（1980s＝1980年代）': 'yearFormatter',
  '間隔號互通（．·‧）': 'interpunctFormatter',
  '排序答案的箭頭可有可無': 'arrowFormatter',
  '注音的一聲符號ˉ可有可無': 'phoneticFormatter',
  '最外層成對引號可有可無': 'outerQuoteOptional',
  '最外層括號可有可無': 'outerBracketOptional',
  '多個答案順序可互換': 'answerOrder',
  '± 可視同正負兩個答案': 'mathPlusMinus',
  '括號因式順序可互換': 'mathFactorOrder'
}
// 開啟時兩種寫法應判定「不相等」的規則（保留空白類）；範例檢查依此決定預期結果
const KEEP_SWITCHES = ['keepDigitSpace', 'keepHanSpace', 'keepLatinSpace']
const RULE_COLUMN = '規則名稱'
// 「規則ID」欄填 SDK 開關名稱（RULE_SWITCHES 的值）。有這一欄時以 ID 比對規則，規則名稱只供顯示、
// 編輯可以自由改名；沒有這一欄時照舊以規則名稱比對
const ID_COLUMN = '規則ID'
const RULE_IDS = Object.values(RULE_SWITCHES)
// 這些欄位的開關寫到 matchTable.formatters，作為未設定科目的 fallback
const ALL_SUBJECTS = ['全科', '預設']
// 勾選框讀出來是 TRUE / FALSE；也接受 Y / N
const VALUES = { TRUE: true, FALSE: false, Y: true, N: false }

const __cell = (row, index) => (row?.[index] ?? '').toString().trim()
// 比對規則名稱時忽略空白，表上多打或少打空白不會變成「不認得的規則」
const __key = (text) => text.replace(/\s+/g, '')
// 改過名的規則仍認得舊名稱，表上還沒跟著改名時 job 不會因「不認得的規則」失敗；表上都改完即可移除
const LEGACY_RULE_SWITCHES = {
  '數字中間有空白不會去掉': 'keepDigitSpace'
}
const __RULE_BY_KEY = Object.fromEntries(Object.entries({ ...LEGACY_RULE_SWITCHES, ...RULE_SWITCHES }).map(([label, name]) => [__key(label), name]))

/**
 * @description 依規則名稱查 SDK 開關名稱；不認得時回傳 undefined。
 * @param {string} label
 * @returns {string|undefined}
 */
const switchOf = (label = '') => __RULE_BY_KEY[__key(label)]

/**
 * @description 找出表頭的「規則名稱」「規則ID」欄，並回傳由一列解析出規則的函式。
 * 有「規則ID」欄時以 ID 比對，ID 空白或不認得都算錯；沒有時以規則名稱比對。
 * 兩張分頁（設定表、規則表）共用，欄位依表頭文字找，不限放在第幾欄。錯誤以 problem 代碼回傳，
 * 訊息由各分頁自己組（設定表拋錯、規則表列為失敗）。
 * problem：noName（沒有規則名稱）、unknownName、noId（有 ID 欄但空白）、unknownId
 * @param {string[]} header
 * @returns {{ nameIndex: number, idIndex: number, ruleOf: (row: string[]) => { name?: string, label: string, id: string, problem?: string } }}
 */
const ruleColumns = (header = []) => {
  const indexOf = title => header.findIndex(cell => (cell ?? '').toString().trim() === title)
  const nameIndex = indexOf(RULE_COLUMN)
  const idIndex = indexOf(ID_COLUMN)
  const ruleOf = (row) => {
    const label = nameIndex === -1 ? '' : __cell(row, nameIndex)
    if (idIndex === -1) {
      if (label === '') return { label, id: '', problem: 'noName' }
      const name = switchOf(label)
      return name ? { name, label, id: '' } : { label, id: '', problem: 'unknownName' }
    }
    const id = __cell(row, idIndex)
    if (id === '') return { label, id, problem: 'noId' }
    if (!RULE_IDS.includes(id)) return { label: label || id, id, problem: 'unknownId' }
    return { name: id, label: label || id, id }
  }
  return { nameIndex, idIndex, ruleOf }
}

/**
 * @description 解析「設定表」分頁。第一列為表頭：「規則名稱」、選填的「規則ID」（見 ruleColumns），
 * 其餘有表頭的欄位是科目；格子填 TRUE / FALSE（勾選框）或 Y / N，空白表示照 SDK 預設。每一科一欄完整設定，
 * 沒列出的科目才用「全科」那一欄。表頭或內容寫錯時拋錯，讓 job 失敗而不是上傳錯的設定。
 * @param {string[][]} sheet
 * @returns {{ formatters: object, subjects: Object<string, { formatters: object }> }}
 */
const parseFormatterSettings = (sheet = []) => {
  const rows = sheet.filter(row => row.some((_, i) => __cell(row, i) !== ''))
  if (!rows.length) return { formatters: {}, subjects: {} }

  const [header, ...ruleRows] = rows
  const { nameIndex, idIndex, ruleOf } = ruleColumns(header)
  if (nameIndex === -1) {
    throw new Error(`Formatter settings sheet: header must have "${RULE_COLUMN}"`)
  }
  const ruleColumnIndexes = [nameIndex, idIndex]
  const columns = []
  let hasDefaultColumn = false
  for (let i = 0; i < header.length; i++) {
    const subject = __cell(header, i)
    if (subject === '' || ruleColumnIndexes.includes(i)) continue
    if (columns.some(column => column.subject === subject)) throw new Error(`Formatter settings sheet: duplicate subject "${subject}"`)
    if (ALL_SUBJECTS.includes(subject)) {
      if (hasDefaultColumn) throw new Error('Formatter settings sheet: only one default column ("全科" or "預設") is allowed')
      hasDefaultColumn = true
    }
    columns.push({ index: i, subject })
  }

  const formatters = {}
  const subjects = {}
  // 記錄所有列出的科目，即使整欄空白；空白 formatter 值會沿用「預設」欄，再沿用程式預設。
  for (const { subject } of columns) {
    if (!ALL_SUBJECTS.includes(subject)) subjects[subject] = { formatters: {} }
  }
  const seen = new Set()
  ruleRows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2
    const { name, label, id, problem } = ruleOf(row)
    if (problem) {
      const message = {
        noName: 'no rule name',
        unknownName: `unknown rule "${label}"`,
        noId: `rule "${label}" has no ${ID_COLUMN}`,
        unknownId: `unknown ${ID_COLUMN} "${id}"`
      }[problem]
      throw new Error(`Formatter settings sheet: ${message} (row ${rowNumber})`)
    }
    if (seen.has(name)) throw new Error(`Formatter settings sheet: duplicate rule "${label}"`)
    seen.add(name)

    // 沒有科目表頭的欄位不該有值，避免漏填表頭而讓整欄設定被忽略
    for (let i = 0; i < row.length; i++) {
      if (__cell(header, i) === '' && __cell(row, i) !== '') {
        throw new Error(`Formatter settings sheet: row ${rowNumber} has a value under an empty header (column ${i + 1})`)
      }
    }
    for (const { index, subject } of columns) {
      const value = __cell(row, index).toUpperCase()
      if (value === '') continue
      if (!(value in VALUES)) throw new Error(`Formatter settings sheet: "${label}" / "${subject}" must be TRUE, FALSE or blank, got "${__cell(row, index)}"`)
      if (ALL_SUBJECTS.includes(subject)) {
        formatters[name] = VALUES[value]
      } else {
        subjects[subject].formatters[name] = VALUES[value]
      }
    }
  })
  return { formatters, subjects }
}

module.exports = { RULE_SWITCHES, KEEP_SWITCHES, RULE_COLUMN, ID_COLUMN, switchOf, ruleColumns, parseFormatterSettings }

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
  '數字中間有空白不會去掉': 'keepDigitSpace',
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
  '注音的一聲符號ˉ可有可無': 'phoneticFormatter'
}
// 開啟時兩種寫法應判定「不相等」的規則（保留空白類）；範例檢查依此決定預期結果
const KEEP_SWITCHES = ['keepDigitSpace', 'keepHanSpace', 'keepLatinSpace']
const RULE_COLUMN = '規則名稱'
// 這一欄的開關寫到 matchTable.formatters，只套用到沒列在表上的科目（fallback）
const ALL_SUBJECTS = '全科'
// 勾選框讀出來是 TRUE / FALSE；也接受 Y / N
const VALUES = { TRUE: true, FALSE: false, Y: true, N: false }

const __cell = (row, index) => (row?.[index] ?? '').toString().trim()
// 比對規則名稱時忽略空白，表上多打或少打空白不會變成「不認得的規則」
const __key = (text) => text.replace(/\s+/g, '')
const __RULE_BY_KEY = Object.fromEntries(Object.entries(RULE_SWITCHES).map(([label, name]) => [__key(label), name]))

/**
 * @description 依規則名稱查 SDK 開關名稱；不認得時回傳 undefined。
 * @param {string} label
 * @returns {string|undefined}
 */
const switchOf = (label = '') => __RULE_BY_KEY[__key(label)]

/**
 * @description 解析「設定表」分頁。第一列為科目（第一格為「規則名稱」），第一欄為規則名稱；
 * 格子填 TRUE / FALSE（勾選框）或 Y / N，空白表示照 SDK 預設。每一科一欄完整設定，
 * 沒列出的科目才用「全科」那一欄。表頭或內容寫錯時拋錯，讓 job 失敗而不是上傳錯的設定。
 * @param {string[][]} sheet
 * @returns {{ formatters: object, subjects: Object<string, { formatters: object }> }}
 */
const parseFormatterSettings = (sheet = []) => {
  const rows = sheet.filter(row => row.some((_, i) => __cell(row, i) !== ''))
  if (!rows.length) return { formatters: {}, subjects: {} }

  const [header, ...ruleRows] = rows
  if (__cell(header, 0) !== RULE_COLUMN) {
    throw new Error(`Formatter settings sheet: first header must be "${RULE_COLUMN}"`)
  }
  const columns = []
  for (let i = 1; i < header.length; i++) {
    const subject = __cell(header, i)
    if (subject === '') continue
    if (columns.some(column => column.subject === subject)) throw new Error(`Formatter settings sheet: duplicate subject "${subject}"`)
    columns.push({ index: i, subject })
  }

  const formatters = {}
  const subjects = {}
  // 有列出的科目都建立（即使整欄空白）：SDK 以有無 formatters 欄位判斷是否退回全科
  for (const { subject } of columns) {
    if (subject !== ALL_SUBJECTS) subjects[subject] = { formatters: {} }
  }
  const seen = new Set()
  ruleRows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2
    const label = __cell(row, 0)
    if (label === '') throw new Error(`Formatter settings sheet: row ${rowNumber} has no rule name`)
    const name = switchOf(label)
    if (!name) throw new Error(`Formatter settings sheet: unknown rule "${label}" (row ${rowNumber})`)
    if (seen.has(name)) throw new Error(`Formatter settings sheet: duplicate rule "${label}"`)
    seen.add(name)

    // 沒有科目表頭的欄位不該有值，避免漏填表頭而讓整欄設定被忽略
    for (let i = 1; i < row.length; i++) {
      if (__cell(header, i) === '' && __cell(row, i) !== '') {
        throw new Error(`Formatter settings sheet: row ${rowNumber} has a value under an empty header (column ${i + 1})`)
      }
    }
    for (const { index, subject } of columns) {
      const value = __cell(row, index).toUpperCase()
      if (value === '') continue
      if (!(value in VALUES)) throw new Error(`Formatter settings sheet: "${label}" / "${subject}" must be TRUE, FALSE or blank, got "${__cell(row, index)}"`)
      if (subject === ALL_SUBJECTS) {
        formatters[name] = VALUES[value]
      } else {
        subjects[subject].formatters[name] = VALUES[value]
      }
    }
  })
  return { formatters, subjects }
}

module.exports = { RULE_SWITCHES, KEEP_SWITCHES, switchOf, parseFormatterSettings }

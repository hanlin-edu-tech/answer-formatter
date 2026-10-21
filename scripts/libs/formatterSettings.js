// 「設定表」「規則表」的「規則ID」欄可以填的值，即 SDK 的開關名稱；新增可切換的規則時兩邊要一起改
// （SDK 端見 src/libs/formatters.js 的 __DEFAULT_SWITCHES）。規則名稱由編輯在表上自由命名，程式只認 ID。
// fullwidthFormatter、removeSpaceFormatter 是細項的總開關，不列在表上，一律照 SDK 預設開啟
const RULE_IDS = [
  'fullwidthAlnum', // 英文、數字、冒號：半形、全形都可以過關
  'removeTailPeriodFormatter', // 答案最後有句號：寫、沒寫句號都可以過關
  'fullwidthComma', // 逗號：全形/半形都可以過關
  'numberFormatter', // 去逗號判斷
  'caseFormatter', // 大小寫互通
  'fullwidthBracket', // 括號全形半形互通
  'trimLeadingDigit', // 第一個數字前面會去空白
  'keepDigitSpace', // 數字中間不會去空白
  'trimLeadingHan', // 第一個國字前面會去空白
  'keepHanSpace', // 國字中間不會去空白
  'trimLeadingLatin', // 英文字前面會去空白
  'keepLatinSpace', // 英文字中間不會去空白
  'fullwidthSlash', // 斜線全形半形互通
  'removeNumberingFormatter', // 去題號
  'latexFormatter', // LaTeX 方程式轉成一般寫法
  'yearFormatter', // 年代寫法互通（1980s＝1980年代）
  'interpunctFormatter', // 間隔號互通（．·‧）
  'arrowFormatter', // 排序答案的箭頭可有可無
  'phoneticFormatter', // 注音的一聲符號ˉ可有可無
  'outerQuoteOptional', // 最外層成對引號可有可無
  'outerBracketOptional', // 最外層括號可有可無
  'answerOrder', // 多個答案順序可互換
  'mathPlusMinus', // ± 可視同正負兩個答案
  'mathFactorOrder' // 括號因式順序可互換
]
// 已拿掉的規則ID：表上還有這一列時忽略並列為警告，不讓 job 失敗，表格可以晚於程式改版
const LEGACY_IDS = {
  fullwidthSpace: '全形空白一律當半形空白，開關已拿掉，這一列可以刪除' // kb-1005019
}
// 開啟時兩種寫法應判定「不相等」的規則（保留空白類）；範例檢查依此決定預期結果
const KEEP_SWITCHES = ['keepDigitSpace', 'keepHanSpace', 'keepLatinSpace']
// 「規則名稱」只供顯示（錯誤訊息用），可以留空；「規則ID」必填，程式以 ID 比對規則
const RULE_COLUMN = '規則名稱'
const ID_COLUMN = '規則ID'
// 這些欄位的開關寫到 matchTable.formatters，作為未設定科目的 fallback
const ALL_SUBJECTS = ['全科', '預設']
// 勾選框讀出來是 TRUE / FALSE；也接受 Y / N
const VALUES = { TRUE: true, FALSE: false, Y: true, N: false }

const __cell = (row, index) => (row?.[index] ?? '').toString().trim()
const __isRuleId = id => RULE_IDS.includes(id) || id in LEGACY_IDS
const __isBlank = row => !(row || []).some((_, i) => __cell(row, i) !== '')

// 表頭可以是兩列：第 1 列英文鍵給程式讀，第 2 列中文說明給人看（編輯可自由改），資料從第 3 列起。
// 英文鍵換成對應的中文欄名後，與單列中文表頭共用同一套解析；SDK 的科目名稱仍是中文。
// 第 1 列沒有 RULE_NAME／RULE_ID 時視為單列中文表頭。新增科目時要在這裡加代碼
const HEADER_KEYS = {
  RULE_NAME: RULE_COLUMN,
  RULE_ID: ID_COLUMN,
  DEFAULT: '預設',
  PC: '國文',
  EN: '英文',
  MA: '數學',
  NA: '自然',
  SO: '社會',
  STANDARD: '標準寫法',
  INPUT: '輸入答案',
  DISPLAY: '對答呈現'
}
/**
 * @description 取出表頭與資料列。空白列略過，但資料列保留 Sheet 上的列號，錯誤訊息才對得上。
 * 兩列表頭時回傳換成中文欄名的表頭，並檢查：不認得的英文鍵（unknownKeys）、中文說明列是否被刪掉
 * （說明列的規則ID格是合法 ID，表示那一列其實是資料；missingDescriptionRow 為該列列號）。
 * @param {string[][]} sheet
 * @returns {{ header: string[], dataRows: { row: string[], rowNumber: number }[], unknownKeys: string[], missingDescriptionRow: number|null }}
 */
const sheetHeader = (sheet = []) => {
  const rows = sheet.map((row, i) => ({ row: row || [], rowNumber: i + 1 })).filter(({ row }) => !__isBlank(row))
  const first = rows[0]?.row || []
  const keys = first.map((_, i) => __cell(first, i))
  if (!keys.includes('RULE_NAME') && !keys.includes('RULE_ID')) {
    return { header: first, dataRows: rows.slice(1), unknownKeys: [], missingDescriptionRow: null }
  }
  const description = rows[1]
  const idIndex = keys.indexOf('RULE_ID')
  const isData = !!description && idIndex !== -1 && __isRuleId(__cell(description.row, idIndex))
  return {
    header: keys.map(key => HEADER_KEYS[key] ?? ''),
    dataRows: rows.slice(2),
    unknownKeys: keys.filter(key => key !== '' && !(key in HEADER_KEYS)),
    missingDescriptionRow: isData ? description.rowNumber : null
  }
}
/**
 * @description 兩張分頁共用的表頭檢查，回傳錯誤訊息（英文，前綴由呼叫端加）；沒問題時回傳 null。
 * @param {ReturnType<typeof sheetHeader>} parsed
 * @returns {string|null}
 */
const headerProblem = ({ header, unknownKeys, missingDescriptionRow }) => {
  if (unknownKeys.length) return `unknown header key ${unknownKeys.map(key => `"${key}"`).join(', ')}`
  if (missingDescriptionRow) return `row ${missingDescriptionRow} is a rule row, but the row below the English header keys must be the description row`
  if (!header.some(cell => __cell([cell], 0) === ID_COLUMN)) return `header must have "${ID_COLUMN}"`
  return null
}

/**
 * @description 找出表頭的「規則名稱」「規則ID」欄，並回傳由一列解析出規則的函式。以 ID 比對，
 * 規則名稱只用在錯誤訊息（空白時改顯示 ID）。兩張分頁（設定表、規則表）共用，欄位依表頭文字找，
 * 不限放在第幾欄。錯誤以 problem 代碼回傳（noId：ID 空白、unknownId），訊息由各分頁自己組。
 * 已拿掉的規則ID（LEGACY_IDS）回傳 legacy（給編輯看的說明），呼叫端略過該列並列為警告。
 * @param {string[]} header
 * @returns {{ nameIndex: number, idIndex: number, ruleOf: (row: string[]) => { name?: string, label: string, id: string, problem?: string, legacy?: string } }}
 */
const ruleColumns = (header = []) => {
  const indexOf = title => header.findIndex(cell => (cell ?? '').toString().trim() === title)
  const nameIndex = indexOf(RULE_COLUMN)
  const idIndex = indexOf(ID_COLUMN)
  const ruleOf = (row) => {
    const name = nameIndex === -1 ? '' : __cell(row, nameIndex)
    const id = __cell(row, idIndex)
    if (id === '') return { label: name, id, problem: 'noId' }
    if (id in LEGACY_IDS) return { label: name || id, id, legacy: LEGACY_IDS[id] }
    if (!RULE_IDS.includes(id)) return { label: name || id, id, problem: 'unknownId' }
    return { name: id, label: name || id, id }
  }
  return { nameIndex, idIndex, ruleOf }
}

/**
 * @description 解析「設定表」分頁。表頭（單列中文，或第 1 列英文鍵＋第 2 列中文，見 sheetHeader）：
 * 「規則ID」（必填）、「規則名稱」（見 ruleColumns），其餘有表頭的欄位是科目；格子填 TRUE / FALSE（勾選框）或 Y / N，空白表示照 SDK 預設。每一科一欄完整設定，
 * 沒列出的科目才用「全科」那一欄。表頭或內容寫錯時拋錯，讓 job 失敗而不是上傳錯的設定。
 * 已拿掉的規則ID 略過，訊息加到 warnings。
 * @param {string[][]} sheet
 * @param {string[]} [warnings]
 * @returns {{ formatters: object, subjects: Object<string, { formatters: object }> }}
 */
const parseFormatterSettings = (sheet = [], warnings = []) => {
  if (sheet.every(__isBlank)) return { formatters: {}, subjects: {} }

  const parsed = sheetHeader(sheet)
  const problem = headerProblem(parsed)
  if (problem) throw new Error(`Formatter settings sheet: ${problem}`)
  const { header, dataRows: ruleRows } = parsed
  const { nameIndex, idIndex, ruleOf } = ruleColumns(header)
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
  ruleRows.forEach(({ row, rowNumber }) => {
    const { name, label, id, problem, legacy } = ruleOf(row)
    if (legacy) {
      warnings.push(`設定表第 ${rowNumber} 列「${label}」（${id}）：${legacy}`)
      return
    }
    if (problem) {
      const message = {
        noId: label ? `rule "${label}" has no ${ID_COLUMN}` : `no ${ID_COLUMN}`,
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

module.exports = { RULE_IDS, LEGACY_IDS, KEEP_SWITCHES, RULE_COLUMN, ID_COLUMN, HEADER_KEYS, sheetHeader, headerProblem, ruleColumns, parseFormatterSettings }

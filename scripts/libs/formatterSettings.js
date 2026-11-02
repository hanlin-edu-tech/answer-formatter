// 設定表的「規則ID」欄可以填的值，除 INVERTED_IDS 外即 SDK 的開關名稱；新增可切換的規則時兩邊要一起改
// （SDK 端見 src/libs/formatters.js 的 __DEFAULT_SWITCHES）。規則名稱由編輯在表上自由命名，程式只認 ID。
// fullwidthFormatter、removeSpaceFormatter 是細項的總開關，不列在表上，一律照 SDK 預設開啟
const RULE_IDS = [
  'fullwidthAlnum', // 英文、數字、冒號：半形、全形都可以過關
  'fullwidthSpace', // 空格：半形、全形都可以過關（關閉時只有中間的全形空白和半形空白不同，kb-1005019）
  'removeTailPeriodFormatter', // 答案最後有句號：寫、沒寫句號都可以過關
  'fullwidthComma', // 逗號：全形/半形都可以過關
  'numberFormatter', // 去逗號判斷
  'caseFormatter', // 大小寫互通
  'fullwidthBracket', // 括號全形半形互通
  'trimLeadingDigit', // 第一個數字前面會去空白
  'removeDigitSpace', // 數字中間的空白會去掉
  'trimLeadingHan', // 第一個國字前面會去空白
  'removeHanSpace', // 國字中間的空白會去掉
  'trimLeadingLatin', // 英文字前面會去空白
  'removeLatinSpace', // 英文字中間的空白會去掉
  'fullwidthSlash', // 斜線全形半形互通
  'removeNumberingFormatter', // 去題號
  'latexFormatter', // LaTeX 方程式轉成一般寫法
  'yearFormatter', // 年代寫法互通（1980s＝1980年代）
  'interpunctFormatter', // 間隔號互通（．·‧）
  'arrowFormatter', // 排序答案的箭頭可有可無
  'phoneticFormatter', // 注音的一聲符號ˉ可有可無
  'outerQuoteOptional', // 最外層成對引號可有可無
  'outerBracketOptional', // 最外層括號可有可無
  'answerOrder', // 多個答案順序可互換（只管順序，kb-1005031）
  'separatorInterchange', // 分隔號互通：、 , ， 視為同一種分隔號（kb-1005031）
  'separatorOptional', // 寫不寫分隔號都算對（kb-1005031，取代部分答案對答「（刪除）← 、」）
  'mathPlusMinus', // ± 可視同正負兩個答案
  'mathFactorOrder' // 括號因式順序可互換
]
// 勾選意思與 SDK 開關相反的規則ID：表上一律用正面說法（勾選＝空白會去掉，kb-1005022），
// SDK 與 matchTable 沿用「保留空白」開關，轉檔時反轉，舊版 SDK 讀到的設定不變
const INVERTED_IDS = {
  removeDigitSpace: 'keepDigitSpace',
  removeHanSpace: 'keepHanSpace',
  removeLatinSpace: 'keepLatinSpace'
}
// 改名前的規則ID：照舊接受（勾選＝保留空白）並列為警告，表格可以晚於程式改版
const RENAMED_IDS = {
  keepDigitSpace: 'removeDigitSpace',
  keepHanSpace: 'removeHanSpace',
  keepLatinSpace: 'removeLatinSpace'
}
// 已拿掉的規則ID：表上還有這一列時忽略並列為警告，不讓 job 失敗，表格可以晚於程式改版
// （格式：{ 規則ID: '給編輯看的說明' }；fullwidthSpace 曾列在這裡，kb-1005019 改回可切換的規則）
const LEGACY_IDS = {}
// 開啟時兩種寫法應判定「不相等」的規則（改名前的保留空白類）；範例檢查依此決定預期結果
const KEEP_SWITCHES = Object.keys(RENAMED_IDS)
// 「規則名稱」只供顯示（錯誤訊息用），可以留空；「規則ID」必填，程式以 ID 比對規則
const RULE_COLUMN = '規則名稱'
const ID_COLUMN = '規則ID'
// 這些欄位的開關寫到 matchTable.formatters，作為未設定科目的 fallback
const ALL_SUBJECTS = ['全科', '預設']
// 範例欄（標準寫法、輸入答案、對答呈現）和開關放在同一張分頁，解析開關時略過（範例檢查見 ruleExamples.js）
const EXAMPLE_COLUMNS = ['標準寫法', '輸入答案', '對答呈現']
// 勾選框讀出來是 TRUE / FALSE；也接受 Y / N
const VALUES = { TRUE: true, FALSE: false, Y: true, N: false }

const { cellOf, quote, rowLabel } = require('./editorMessages')

const __cell = (row, index) => (row?.[index] ?? '').toString().trim()
const __isRuleId = id => RULE_IDS.includes(id) || id in RENAMED_IDS || id in LEGACY_IDS
/**
 * @description 規則ID 對應的 SDK 開關；invert 為 true 時表上的勾選要反轉後才是開關值
 * @param {string} id
 * @returns {{ name: string, invert: boolean }}
 */
const switchOf = id => INVERTED_IDS[id] ? { name: INVERTED_IDS[id], invert: true } : { name: id, invert: false }
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
 * 兩列表頭時回傳換成中文欄名的表頭，並檢查：不認得的英文鍵（unknownColumns，含欄位順序）、中文說明列是否被刪掉
 * （說明列的規則ID格是合法 ID，表示那一列其實是資料；missingDescriptionRow 為該列列號）。
 * headerRowNumber 為表頭（兩列表頭時為英文鍵那一列）的列號，keys 為該列原本填的字。
 * @param {string[][]} sheet
 * @returns {{ header: string[], keys: string[], headerRowNumber: number, dataRows: { row: string[], rowNumber: number }[], unknownColumns: { key: string, index: number }[], missingDescriptionRow: number|null }}
 */
const sheetHeader = (sheet = []) => {
  const rows = sheet.map((row, i) => ({ row: row || [], rowNumber: i + 1 })).filter(({ row }) => !__isBlank(row))
  const first = rows[0]?.row || []
  const headerRowNumber = rows[0]?.rowNumber || 1
  const keys = first.map((_, i) => __cell(first, i))
  if (!keys.includes('RULE_NAME') && !keys.includes('RULE_ID')) {
    return { header: first, keys, headerRowNumber, dataRows: rows.slice(1), unknownColumns: [], missingDescriptionRow: null }
  }
  const description = rows[1]
  const idIndex = keys.indexOf('RULE_ID')
  const isData = !!description && idIndex !== -1 && __isRuleId(__cell(description.row, idIndex))
  return {
    header: keys.map(key => HEADER_KEYS[key] ?? ''),
    keys,
    headerRowNumber,
    dataRows: rows.slice(2),
    unknownColumns: keys.map((key, index) => ({ key, index })).filter(({ key }) => key !== '' && !(key in HEADER_KEYS)),
    missingDescriptionRow: isData ? description.rowNumber : null
  }
}
// 科目欄可以填的英文鍵（給編輯看的說明用）
const SUBJECT_KEYS = Object.keys(HEADER_KEYS).filter(key => !['RULE_NAME', 'RULE_ID', 'STANDARD', 'INPUT', 'DISPLAY'].includes(key))
/**
 * @description 兩張分頁共用的表頭檢查，回傳給編輯看的問題（{ location, text }，見 editorMessages）；沒問題時回傳空陣列。
 * 表頭有問題時無法判斷每一欄是什麼，呼叫端不再往下解析。
 * @param {ReturnType<typeof sheetHeader>} parsed
 * @returns {{ location: string, text: string }[]}
 */
const headerProblems = ({ header, headerRowNumber, unknownColumns = [], missingDescriptionRow }) => {
  if (unknownColumns.length) {
    return unknownColumns.map(({ key, index }) => ({
      location: cellOf(index, headerRowNumber),
      text: ` 的科目代碼${quote(key)}不認得，只能填 ${SUBJECT_KEYS.join('、')}。`
    }))
  }
  if (missingDescriptionRow) {
    return [{ location: `第 ${missingDescriptionRow} 列`, text: '是規則，但英文表頭下面一列要是中文說明。請在英文表頭下面加回說明列；不確定的話請找工程。' }]
  }
  if (!header.some(cell => __cell([cell], 0) === ID_COLUMN)) {
    return [{ location: `第 ${headerRowNumber} 列`, text: `（表頭）找不到「${ID_COLUMN}」欄（英文表頭是 RULE_ID），請改回原本的表頭。` }]
  }
  return []
}

/**
 * @description 找出表頭的「規則名稱」「規則ID」欄，並回傳由一列解析出規則的函式。以 ID 比對，
 * 規則名稱只用在錯誤訊息（空白時改顯示 ID）。設定解析與範例檢查共用，欄位依表頭文字找，
 * 不限放在第幾欄。錯誤以 problem 代碼回傳（noId：ID 空白、unknownId），訊息由各分頁自己組。
 * 已拿掉的規則ID（LEGACY_IDS）回傳 legacy（給編輯看的說明），呼叫端略過該列並列為警告；
 * 改名前的規則ID（RENAMED_IDS）照舊解析，renamedTo 為新 ID，呼叫端列為警告。
 * @param {string[]} header
 * @returns {{ nameIndex: number, idIndex: number, ruleOf: (row: string[]) => { name?: string, label: string, id: string, problem?: string, legacy?: string, renamedTo?: string } }}
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
    if (id in RENAMED_IDS) return { name: id, label: name || id, id, renamedTo: RENAMED_IDS[id] }
    if (!RULE_IDS.includes(id)) return { label: name || id, id, problem: 'unknownId' }
    return { name: id, label: name || id, id }
  }
  return { nameIndex, idIndex, ruleOf }
}

/**
 * @description 解析「設定表」分頁。表頭（單列中文，或第 1 列英文鍵＋第 2 列中文，見 sheetHeader）：
 * 「規則ID」（必填）、「規則名稱」（見 ruleColumns）、範例欄（EXAMPLE_COLUMNS，略過），其餘有表頭的欄位是科目；格子填 TRUE / FALSE（勾選框）或 Y / N，空白表示照 SDK 預設。每一科一欄完整設定，
 * 沒列出的科目才用「全科」那一欄。
 * 表頭或內容寫錯時把問題加到 problems（{ sheet, location, text }，見 editorMessages），由呼叫端擋下上傳；
 * 為了一次列出所有問題，填錯的格子當成空白、有問題的列略過，繼續解析其他列（kb-1005461）。表頭有問題時不解析內容。
 * 已拿掉的規則ID 略過，訊息加到 warnings。
 * @param {string[][]} sheet
 * @param {string[]} [warnings]
 * @param {object[]} [problems]
 * @returns {{ formatters: object, subjects: Object<string, { formatters: object }> }}
 */
const parseFormatterSettings = (sheet = [], warnings = [], problems = []) => {
  if (sheet.every(__isBlank)) return { formatters: {}, subjects: {} }
  const report = (location, text) => problems.push({ sheet: 'settings', location, text })

  const parsed = sheetHeader(sheet)
  const headerIssues = headerProblems(parsed)
  if (headerIssues.length) {
    headerIssues.forEach(({ location, text }) => report(location, text))
    return { formatters: {}, subjects: {} }
  }
  const { header, keys, headerRowNumber, dataRows: ruleRows } = parsed
  const { nameIndex, idIndex, ruleOf } = ruleColumns(header)
  const ruleColumnIndexes = [nameIndex, idIndex]
  const candidates = []
  for (let i = 0; i < header.length; i++) {
    const subject = __cell(header, i)
    if (subject === '' || ruleColumnIndexes.includes(i) || EXAMPLE_COLUMNS.includes(subject)) continue
    candidates.push({ index: i, subject })
  }
  // 同一科（或預設欄）出現兩次時無法判斷哪一欄才對，列出後不解析內容
  const headerCells = indexes => indexes.map(index => cellOf(index, headerRowNumber)).join('、')
  let duplicated = false
  for (const subject of [...new Set(candidates.map(({ subject }) => subject))]) {
    const indexes = candidates.filter(column => column.subject === subject).map(({ index }) => index)
    if (indexes.length > 1) {
      duplicated = true
      report(headerCells(indexes), ` 都是${quote(__cell(keys, indexes[0]) || subject)}，同一科只能有一欄，請改回原本的科目代碼。`)
    }
  }
  const defaults = candidates.filter(({ subject }) => ALL_SUBJECTS.includes(subject))
  if (new Set(defaults.map(({ subject }) => subject)).size > 1) {
    duplicated = true
    report(headerCells(defaults.map(({ index }) => index)), ' 都是預設欄，只能有一欄，請刪掉其中一欄。')
  }
  if (duplicated) return { formatters: {}, subjects: {} }
  const columns = candidates

  const formatters = {}
  const subjects = {}
  // 記錄所有列出的科目，即使整欄空白；空白 formatter 值會沿用「預設」欄，再沿用程式預設。
  for (const { subject } of columns) {
    if (!ALL_SUBJECTS.includes(subject)) subjects[subject] = { formatters: {} }
  }
  // 開關 → 第一次出現的列（列號、規則ID），用來回報重複
  const seen = new Map()
  ruleRows.forEach(({ row, rowNumber }) => {
    const { name, label, id, problem, legacy, renamedTo } = ruleOf(row)
    const ruleName = nameIndex === -1 ? '' : __cell(row, nameIndex)
    const idCell = cellOf(idIndex, rowNumber)
    if (legacy) {
      warnings.push(`設定表第 ${rowNumber} 列「${label}」（${id}）：${legacy}`)
      return
    }
    if (renamedTo) warnings.push(`設定表第 ${rowNumber} 列「${label}」（${id}）：請改用 ${renamedTo}，勾選的意思相反（勾選＝空白會去掉），範例改成開啟時空白會去掉`)
    if (problem === 'noId') {
      report(`${idCell}（${rowLabel(rowNumber, ruleName)}的規則ID）`, '是空的，請填回規則ID。')
      return
    }
    if (problem === 'unknownId') {
      report(`${idCell}（${rowLabel(rowNumber, ruleName)}的規則ID）`, `填的是${quote(id)}，系統不認得。請改回原本的規則ID；不確定的話請找工程。`)
      return
    }
    // 改名前後的 ID 對到同一個開關，同時出現也算重複
    const target = switchOf(name)
    const first = seen.get(target.name)
    if (first) {
      const cells = `${cellOf(idIndex, first.rowNumber)}、${idCell}`
      report(cells, first.id === id
        ? ` 的規則ID 都是${quote(id)}，同一條規則只能有一列，請刪掉其中一列或改回原本的規則ID。`
        : ` 的規則ID「${first.id}」「${id}」是同一條規則（改名前後的規則ID），同一條規則只能有一列，請刪掉其中一列。`)
      return
    }
    seen.set(target.name, { rowNumber, id })

    // 沒有科目表頭的欄位不該有值，避免漏填表頭而讓整欄設定被忽略
    for (let i = 0; i < row.length; i++) {
      if (__cell(header, i) === '' && __cell(row, i) !== '') {
        report(cellOf(i, rowNumber), ` 填了${quote((row[i] ?? '').toString())}，但這一欄沒有表頭。請刪掉這格的內容，或在第 ${headerRowNumber} 列填上科目代碼。`)
      }
    }
    for (const { index, subject } of columns) {
      const value = __cell(row, index).toUpperCase()
      if (value === '') continue
      if (!(value in VALUES)) {
        report(`${cellOf(index, rowNumber)}（${rowLabel(rowNumber, ruleName)}的「${subject}」欄）`, `填的是${quote((row[index] ?? '').toString())}，這一格只能打勾或不打勾。`)
        continue
      }
      const enabled = target.invert ? !VALUES[value] : VALUES[value]
      if (ALL_SUBJECTS.includes(subject)) {
        formatters[target.name] = enabled
      } else {
        subjects[subject].formatters[target.name] = enabled
      }
    }
  })
  return { formatters, subjects }
}

module.exports = { RULE_IDS, INVERTED_IDS, RENAMED_IDS, LEGACY_IDS, KEEP_SWITCHES, switchOf, RULE_COLUMN, ID_COLUMN, ALL_SUBJECTS, EXAMPLE_COLUMNS, HEADER_KEYS, sheetHeader, headerProblems, ruleColumns, parseFormatterSettings }

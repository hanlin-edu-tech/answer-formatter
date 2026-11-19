const { cellOf, quote, rowLabel } = require('./editorMessages')
const { subjectKey, subjectName } = require('./formatterSettings')

const PRIME_COLUMN = '標準答案'
// 不是科目的欄位；reload 沒有用途，解析時忽略
const ENABLED_COLUMN = 'enabled'
const IGNORED_COLUMNS = ['reload']
// 表頭可以是兩列（同設定表，kb-1002894）：第 1 列英文欄位ID給程式讀，第 2 列中文說明給人看（編輯可自由改），
// 資料從第 3 列起。英文ID換成對應的中文欄名後，與單列中文表頭共用同一套解析。
// INPUT 右邊表頭空白的欄也是輸入答案。科目欄寫代碼，輸出也是代碼（kb-1006085）
const STANDARD_KEY = 'STANDARD'
const HEADER_KEYS = {
  ENABLED: ENABLED_COLUMN,
  GLOBAL: '全域替換',
  // 換成科目名稱：給編輯看的訊息寫科目名稱，輸出時再換回代碼
  PC: subjectName('PC'),
  EN: subjectName('EN'),
  MA: subjectName('MA'),
  NA: subjectName('NA'),
  SO: subjectName('SO'),
  [STANDARD_KEY]: PRIME_COLUMN,
  INPUT: '輸入答案'
}
// 英文ID的別名：enabled 原本就是英文欄名，照舊接受
const KEY_ALIASES = { [ENABLED_COLUMN]: 'ENABLED' }
// 部分答案對答表的設定欄：勾了的列輸出成 matchTable 的 variantMatch，在完整答案對答之前套用，表上所有字串也先套用
const GLOBAL_COLUMN = HEADER_KEYS.GLOBAL
const VALUES = { TRUE: true, FALSE: false, Y: true, N: false }

const __cell = (row, index) => (row?.[index] ?? '').toString().trim()
const __isBlank = (row) => !row.some((_, i) => __cell(row, i) !== '')

const __buildRule = (row, primeIndex) => ({
  primeText: row[primeIndex]?.toString().trim() ?? '',
  matchText: row.slice(primeIndex + 1).filter(text => text?.toString().trim())
})

/**
 * @description 找出表頭。第 1 列（略過空白列）有 STANDARD 時為兩列表頭：換成中文欄名，資料從說明列的下一列起；
 * 否則第 1 列為中文表頭。表頭有問題時把問題加到 problems 並回傳 null（無法判斷每一欄是什麼，不往下解析）：
 * 不認得的英文ID、說明列被刪掉（英文表頭下一列的勾選格是 TRUE / FALSE，表示那一列其實是資料）、
 * 兩種表頭都找不到「標準答案」欄。
 * @returns {{ header: string[], headerRowNumber: number, dataStart: number }|null} dataStart 為第一筆資料在 sheet 的索引
 */
const __header = (sheet, firstIndex, problems) => {
  const first = sheet[firstIndex]
  const headerRowNumber = firstIndex + 1
  const keys = first.map((_, i) => __cell(first, i)).map(key => KEY_ALIASES[key] ?? key)
  if (!keys.includes(STANDARD_KEY)) {
    if (keys.includes(PRIME_COLUMN)) return { header: first, headerRowNumber, dataStart: firstIndex + 1 }
    problems.push({ location: `第 ${headerRowNumber} 列`, text: `（表頭）找不到「${PRIME_COLUMN}」欄（英文表頭是 ${STANDARD_KEY}），請改回原本的表頭；不確定的話請找工程。` })
    return null
  }
  const unknown = keys.map((key, index) => ({ key, index })).filter(({ key }) => key !== '' && !(key in HEADER_KEYS))
  if (unknown.length) {
    unknown.forEach(({ key, index }) => problems.push({
      location: cellOf(index, headerRowNumber),
      text: ` 的英文欄位ID${quote(key)}不認得，只能填 ${Object.keys(HEADER_KEYS).join('、')}。請改回原本的表頭；不確定的話請找工程。`
    }))
    return null
  }
  let descriptionIndex = firstIndex + 1
  while (descriptionIndex < sheet.length && __isBlank(sheet[descriptionIndex] || [])) descriptionIndex++
  const description = sheet[descriptionIndex]
  const flagKeys = keys.map((key, index) => ({ key, index })).filter(({ key }) => key !== '' && !['STANDARD', 'INPUT'].includes(key))
  if (description && flagKeys.some(({ index }) => __cell(description, index).toUpperCase() in VALUES)) {
    problems.push({ location: `第 ${descriptionIndex + 1} 列`, text: '是規則，但英文表頭下面一列要是中文說明。請在英文表頭下面加回說明列；不確定的話請找工程。' })
    return null
  }
  return { header: keys.map(key => HEADER_KEYS[key] ?? ''), headerRowNumber, dataStart: descriptionIndex + 1 }
}

/**
 * @description 解析完整／部分答案對答分頁，回傳給新版 SDK（v2）與舊版 SDK（v1）的規則列。
 * - 表頭：兩列表頭（英文欄位ID＋中文說明，見 HEADER_KEYS）或單列中文表頭，都要有「標準答案」欄；
 *   「標準答案」之前為 enabled、全域替換與各科勾選欄，之後為輸入答案。
 *   enabled 為 FALSE 的列不輸出；各科都勾的列不帶 subjects，否則帶勾選的科目；
 *   全域替換勾了的列放進 globalRules，其餘放進 rules
 * - 找不到表頭時不解析、把問題加到 problems（kb-1002894）：以前當成沒有表頭、不分科的舊格式，
 *   表頭被改名時會默默產出錯的表
 * v1 不帶科目資訊，輸出 rules 的所有列（不含全域替換），舊版 SDK 行為不變。
 * 另回傳給編輯看的訊息要用的列號（不寫進 matchTable）：rowNumbers、globalRowNumbers 分別與 rules、globalRules
 * 一一對應；rows 為所有規則列（含停用的列，enabled 為 false；global 表示勾了全域替換）。
 * 勾選格填錯、科目欄重複時把問題（{ location, text }，見 editorMessages）加到 problems，由呼叫端擋下上傳；
 * 為了一次列出所有問題，填錯的勾選格當成空白、重複的科目欄只用第一欄，繼續解析（kb-1005461）。
 * @param {string[][]} sheet
 * @param {{ location: string, text: string }[]} [problems]
 * @returns {{ rules: object[], globalRules: object[], rulesV1: object[], subjectColumns: string[], rowNumbers: number[], globalRowNumbers: number[], rows: { rowNumber: number, primeText: string, matchText: string[], enabled: boolean, global: boolean }[] }}
 */
const parseMatchSheet = (sheet = [], problems = []) => {
  const empty = { rules: [], globalRules: [], rulesV1: [], subjectColumns: [], rowNumbers: [], globalRowNumbers: [], rows: [] }
  const firstIndex = sheet.findIndex(row => !__isBlank(row || []))
  if (firstIndex < 0) return empty
  const found = __header(sheet, firstIndex, problems)
  if (!found) return empty
  const { header, headerRowNumber, dataStart } = found
  const primeIndex = header.findIndex((_, i) => __cell(header, i) === PRIME_COLUMN)

  let enabledIndex = -1
  let globalIndex = -1
  const subjectColumns = []
  const duplicates = {}
  for (let i = 0; i < primeIndex; i++) {
    const label = __cell(header, i)
    if (label === '' || IGNORED_COLUMNS.includes(label)) continue
    if (label === ENABLED_COLUMN) {
      enabledIndex = i
      continue
    }
    if (label === GLOBAL_COLUMN) {
      globalIndex = i
      continue
    }
    // 科目一律輸出代碼（數學 → MA，kb-1006085）；表頭寫名稱或代碼都可以
    const subject = subjectKey(label)
    const first = subjectColumns.find(column => column.subject === subject)
    if (first) {
      duplicates[subject] = [...(duplicates[subject] || [first.index]), i]
      continue
    }
    subjectColumns.push({ index: i, subject, label })
  }
  for (const [subject, indexes] of Object.entries(duplicates)) {
    problems.push({
      location: indexes.map(index => cellOf(index, headerRowNumber)).join('、'),
      text: ` 都是${quote(subjectName(subject))}，同一科只能有一欄，請改回原本的科目名稱。`
    })
  }

  const rules = []
  const rowNumbers = []
  const globalRules = []
  const globalRowNumbers = []
  const rows = []
  sheet.slice(dataStart).forEach((row, rowIndex) => {
    if (__isBlank(row || [])) return
    const rowNumber = dataStart + rowIndex + 1
    const rule = __buildRule(row, primeIndex)
    // 勾選格的值；填錯時列為問題並當成空白
    const flag = (index, label) => {
      const value = __cell(row, index).toUpperCase()
      if (value === '') return null
      if (value in VALUES) return VALUES[value]
      problems.push({
        location: `${cellOf(index, rowNumber)}（${rowLabel(rowNumber, rule.primeText)}的「${label}」欄）`,
        text: `填的是${quote((row[index] ?? '').toString())}，這一格只能打勾或不打勾。`
      })
      return null
    }
    const enabled = enabledIndex < 0 || flag(enabledIndex, ENABLED_COLUMN) !== false
    const global = globalIndex >= 0 && flag(globalIndex, GLOBAL_COLUMN) === true
    // 訊息用表頭上寫的科目（國文或 PC），輸出用代碼
    const checked = subjectColumns.filter(({ index, label }) => flag(index, label) === true).map(({ subject }) => subject)
    rows.push({ rowNumber, ...rule, enabled, global })
    if (!enabled) return
    if (checked.length < subjectColumns.length) rule.subjects = checked
    if (global) {
      globalRules.push(rule)
      globalRowNumbers.push(rowNumber)
    } else {
      rules.push(rule)
      rowNumbers.push(rowNumber)
    }
  })
  const rulesV1 = rules.map(({ primeText, matchText }) => ({ primeText, matchText }))
  return { rules, globalRules, rulesV1, subjectColumns: subjectColumns.map(({ subject }) => subject), rowNumbers, globalRowNumbers, rows }
}

module.exports = { parseMatchSheet, GLOBAL_COLUMN, HEADER_KEYS }

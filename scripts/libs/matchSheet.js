const { cellOf, quote, rowLabel } = require('./editorMessages')
const { subjectKey, subjectName } = require('./formatterSettings')

const PRIME_COLUMN = '標準答案'
// 不是科目的欄位；reload 沒有用途，解析時忽略
const ENABLED_COLUMN = 'enabled'
const IGNORED_COLUMNS = ['reload']
const VALUES = { TRUE: true, FALSE: false, Y: true, N: false }

const __cell = (row, index) => (row?.[index] ?? '').toString().trim()
const __isBlank = (row) => !row.some((_, i) => __cell(row, i) !== '')

const __buildRule = (row, primeIndex) => ({
  primeText: row[primeIndex]?.toString().trim() ?? '',
  matchText: row.slice(primeIndex + 1).filter(text => text?.toString().trim())
})

/**
 * @description 解析完整／部分答案對答分頁，回傳給新版 SDK（v2）與舊版 SDK（v1）的規則列。
 * - 新格式：第一列表頭含「標準答案」；之前為 enabled 與各科勾選欄，之後為輸入答案。
 *   enabled 為 FALSE 的列不輸出；各科都勾的列不帶 subjects，否則帶勾選的科目
 * - 舊格式（沒有「標準答案」表頭）：每列第一欄為標準答案、其後為輸入答案，不分科
 * v1 不帶科目資訊，輸出所有 enabled 的列，舊版 SDK 行為不變。
 * 另回傳給編輯看的訊息要用的列號（不寫進 matchTable）：rowNumbers 與 rules 一一對應；rows 為所有規則列
 * （含停用的列，enabled 為 false）。
 * 勾選格填錯、科目欄重複時把問題（{ location, text }，見 editorMessages）加到 problems，由呼叫端擋下上傳；
 * 為了一次列出所有問題，填錯的勾選格當成空白、重複的科目欄只用第一欄，繼續解析（kb-1005461）。
 * @param {string[][]} sheet
 * @param {{ location: string, text: string }[]} [problems]
 * @returns {{ rules: object[], rulesV1: object[], subjectColumns: string[], rowNumbers: number[], rows: { rowNumber: number, primeText: string, matchText: string[], enabled: boolean }[] }}
 */
const parseMatchSheet = (sheet = [], problems = []) => {
  const firstIndex = sheet.findIndex(row => !__isBlank(row))
  const header = firstIndex >= 0 ? sheet[firstIndex] : []
  const primeIndex = header.findIndex((_, i) => __cell(header, i) === PRIME_COLUMN)

  if (primeIndex < 0) {
    const rules = sheet.map(row => __buildRule(row, 0))
    const rowNumbers = rules.map((_, i) => i + 1)
    const rows = rules.map((rule, i) => ({ rowNumber: i + 1, ...rule, enabled: true }))
    return { rules, rulesV1: rules, subjectColumns: [], rowNumbers, rows }
  }

  const headerRowNumber = firstIndex + 1
  let enabledIndex = -1
  const subjectColumns = []
  const duplicates = {}
  for (let i = 0; i < primeIndex; i++) {
    const label = __cell(header, i)
    if (label === '' || IGNORED_COLUMNS.includes(label)) continue
    if (label === ENABLED_COLUMN) {
      enabledIndex = i
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
  const rows = []
  sheet.slice(firstIndex + 1).forEach((row, rowIndex) => {
    if (__isBlank(row)) return
    const rowNumber = firstIndex + rowIndex + 2
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
    // 訊息用表頭上寫的科目（國文或 PC），輸出用代碼
    const checked = subjectColumns.filter(({ index, label }) => flag(index, label) === true).map(({ subject }) => subject)
    rows.push({ rowNumber, ...rule, enabled })
    if (!enabled) return
    if (checked.length < subjectColumns.length) rule.subjects = checked
    rules.push(rule)
    rowNumbers.push(rowNumber)
  })
  const rulesV1 = rules.map(({ primeText, matchText }) => ({ primeText, matchText }))
  return { rules, rulesV1, subjectColumns: subjectColumns.map(({ subject }) => subject), rowNumbers, rows }
}

module.exports = { parseMatchSheet }

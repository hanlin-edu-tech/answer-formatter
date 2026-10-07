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

const __flag = (row, index, label, rowNumber) => {
  const value = __cell(row, index).toUpperCase()
  if (value === '') return null
  if (!(value in VALUES)) throw new Error(`Match sheet: row ${rowNumber} "${label}" must be TRUE, FALSE or blank, got "${__cell(row, index)}"`)
  return VALUES[value]
}

/**
 * @description 解析完整／部分答案對答分頁，回傳給新版 SDK（v2）與舊版 SDK（v1）的規則列。
 * - 新格式：第一列表頭含「標準答案」；之前為 enabled 與各科勾選欄，之後為輸入答案。
 *   enabled 為 FALSE 的列不輸出；各科都勾的列不帶 subjects，否則帶勾選的科目
 * - 舊格式（沒有「標準答案」表頭）：每列第一欄為標準答案、其後為輸入答案，不分科
 * v1 不帶科目資訊，輸出所有 enabled 的列，舊版 SDK 行為不變。
 * @param {string[][]} sheet
 * @returns {{ rules: object[], rulesV1: object[], subjectColumns: string[] }}
 */
const parseMatchSheet = (sheet = []) => {
  const firstIndex = sheet.findIndex(row => !__isBlank(row))
  const header = firstIndex >= 0 ? sheet[firstIndex] : []
  const primeIndex = header.findIndex((_, i) => __cell(header, i) === PRIME_COLUMN)

  if (primeIndex < 0) {
    const rules = sheet.map(row => __buildRule(row, 0))
    return { rules, rulesV1: rules, subjectColumns: [] }
  }

  let enabledIndex = -1
  const subjectColumns = []
  for (let i = 0; i < primeIndex; i++) {
    const label = __cell(header, i)
    if (label === '' || IGNORED_COLUMNS.includes(label)) continue
    if (label === ENABLED_COLUMN) {
      enabledIndex = i
      continue
    }
    if (subjectColumns.some(column => column.subject === label)) throw new Error(`Match sheet: duplicate subject column "${label}"`)
    subjectColumns.push({ index: i, subject: label })
  }

  const rules = []
  sheet.slice(firstIndex + 1).forEach((row, rowIndex) => {
    if (__isBlank(row)) return
    const rowNumber = firstIndex + rowIndex + 2
    if (enabledIndex >= 0 && __flag(row, enabledIndex, ENABLED_COLUMN, rowNumber) === false) return
    const rule = __buildRule(row, primeIndex)
    const checked = subjectColumns.filter(({ index, subject }) => __flag(row, index, subject, rowNumber) === true).map(({ subject }) => subject)
    if (checked.length < subjectColumns.length) rule.subjects = checked
    rules.push(rule)
  })
  const rulesV1 = rules.map(({ primeText, matchText }) => ({ primeText, matchText }))
  return { rules, rulesV1, subjectColumns: subjectColumns.map(({ subject }) => subject) }
}

module.exports = { parseMatchSheet }

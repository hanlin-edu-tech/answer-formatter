// 「科目設定」分頁的表頭（中文）對應 SDK 的 formatter 名稱；新增可切換的 formatter 時兩邊要一起改
// （SDK 端見 src/libs/formatters.js 的 __DEFAULT_SWITCHES）
const FORMATTER_COLUMNS = {
  全形轉半形: 'fullwidthFormatter',
  LaTeX轉純文字: 'latexFormatter',
  不分大小寫: 'caseFormatter',
  去空白: 'removeSpaceFormatter',
  年代: 'yearFormatter',
  間隔號: 'interpunctFormatter',
  排序箭頭: 'arrowFormatter',
  刪句尾句號: 'removeTailPeriodFormatter',
  注音: 'phoneticFormatter'
}
const SUBJECT_COLUMN = '科目'
// 這一列的開關寫到 matchTable.formatters，只套用到沒列在分頁上的科目（fallback）
const ALL_SUBJECTS = '全科'
const VALUES = { Y: true, N: false }

const __cell = (row, index) => (row[index] ?? '').toString().trim()

/**
 * @description 解析「科目設定」分頁。第一列為表頭，第一欄為科目；格子填 Y / N，空白表示照 SDK
 * 預設。有列出的科目只看自己那一列，沒列出的科目才用「全科」那一列。
 * 表頭或內容寫錯時拋錯，讓 job 失敗而不是上傳錯的設定。
 * @param {string[][]} sheet
 * @returns {{ formatters: object, subjects: Object<string, { formatters: object }> }}
 */
const parseFormatterSettings = (sheet = []) => {
  const rows = sheet.filter(row => row.some((_, i) => __cell(row, i) !== ''))
  if (!rows.length) return { formatters: {}, subjects: {} }

  const [header, ...dataRows] = rows
  if (__cell(header, 0) !== SUBJECT_COLUMN) {
    throw new Error(`Formatter settings sheet: first header must be "${SUBJECT_COLUMN}"`)
  }
  const columns = []
  for (let i = 1; i < header.length; i++) {
    const label = __cell(header, i)
    if (label === '') continue
    const name = FORMATTER_COLUMNS[label]
    if (!name) throw new Error(`Formatter settings sheet: unknown column "${label}"`)
    if (columns.some(column => column.name === name)) throw new Error(`Formatter settings sheet: duplicate column "${label}"`)
    columns.push({ index: i, label, name })
  }

  const formatters = {}
  const subjects = {}
  const seen = new Set()
  dataRows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 2
    const subject = __cell(row, 0)
    if (subject === '') throw new Error(`Formatter settings sheet: row ${rowNumber} has no subject`)
    if (seen.has(subject)) throw new Error(`Formatter settings sheet: duplicate subject "${subject}"`)
    seen.add(subject)

    // 沒有表頭的欄位不該有值，避免漏填表頭而讓整欄設定被忽略
    for (let i = 1; i < row.length; i++) {
      if (__cell(header, i) === '' && __cell(row, i) !== '') {
        throw new Error(`Formatter settings sheet: row ${rowNumber} has a value under an empty header (column ${i + 1})`)
      }
    }

    const switches = {}
    for (const { index, label, name } of columns) {
      const value = __cell(row, index).toUpperCase()
      if (value === '') continue
      if (!(value in VALUES)) throw new Error(`Formatter settings sheet: "${subject}" / "${label}" must be Y, N or blank, got "${__cell(row, index)}"`)
      switches[name] = VALUES[value]
    }
    if (subject === ALL_SUBJECTS) {
      Object.assign(formatters, switches)
    } else {
      subjects[subject] = { formatters: switches }
    }
  })
  return { formatters, subjects }
}

module.exports = { FORMATTER_COLUMNS, parseFormatterSettings }

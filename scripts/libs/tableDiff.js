const { sheetHeader, headerProblem, ruleColumns, switchOf } = require('./formatterSettings')

const KINDS = { fullMatch: '完整答案對答表', partialMatch: '部分答案對答表', variantMatch: '異體字對答表' }
const DEFAULT_COLUMN = '預設'

const __text = value => value === '' ? '（刪除）' : value
const __subjects = subjects => subjects ? subjects.join('、') : '全部科目'
const __row = ({ primeText = '', matchText = [], subjects }) =>
  `標準答案「${__text(primeText)}」、輸入答案「${matchText.join(' ')}」${subjects ? `〔${__subjects(subjects)}〕` : ''}`
const __key = ({ primeText = '', matchText = [], subjects }) => JSON.stringify([primeText, matchText, subjects || null])

// 同一張表的列兩邊比對：內容完全相同的列不算變動（只調順序不列出），其餘依標準答案配對，
// 同一個標準答案恰好一列不見、一列多出來時當成修改，否則分別列為移除與新增
const __diffRows = (label, before = [], after = []) => {
  const remaining = new Map()
  for (const row of before) remaining.set(__key(row), [...(remaining.get(__key(row)) || []), row])
  const added = []
  for (const row of after) {
    const same = remaining.get(__key(row))
    if (same?.length) same.shift()
    else added.push(row)
  }
  const removed = [...remaining.values()].flat()
  const lines = []
  for (const row of removed) {
    const sameprime = rows => rows.filter(other => other.primeText === row.primeText)
    const [replacement, ...others] = sameprime(added)
    if (replacement && !others.length && sameprime(removed).length === 1) {
      added.splice(added.indexOf(replacement), 1)
      const changes = []
      if (row.matchText.join(' ') !== replacement.matchText.join(' ')) {
        changes.push(`輸入答案從「${row.matchText.join(' ')}」改成「${replacement.matchText.join(' ')}」`)
      }
      if (__subjects(row.subjects) !== __subjects(replacement.subjects)) {
        changes.push(`科目從「${__subjects(row.subjects)}」改成「${__subjects(replacement.subjects)}」`)
      }
      lines.push(`${label}：修改標準答案「${__text(row.primeText)}」那列，${changes.join('，')}`)
      continue
    }
    lines.push(`${label}：少了（停用或刪除）${__row(row)}`)
  }
  for (const row of added) lines.push(`${label}：多了 ${__row(row)}`)
  return lines
}

// matchTable 裡的開關是 SDK 名稱；換回設定表上的規則名稱與勾選意思（removeHanSpace 勾選＝keepHanSpace 關閉）
const __switchLabels = (settingsSheet) => {
  const labels = {}
  if (!settingsSheet) return labels
  const parsed = sheetHeader(settingsSheet)
  if (headerProblem(parsed)) return labels
  const { ruleOf } = ruleColumns(parsed.header)
  for (const { row } of parsed.dataRows) {
    const { name, label } = ruleOf(row)
    if (name) labels[switchOf(name).name] = { label, invert: switchOf(name).invert }
  }
  return labels
}

const __diffSwitches = (before = {}, after = {}, settingsSheet) => {
  const labels = __switchLabels(settingsSheet)
  const cell = (value, invert) => value === undefined ? '空白' : (invert ? !value : value) ? '勾選' : '不勾'
  const columns = [
    [DEFAULT_COLUMN, before.formatters, after.formatters],
    ...[...new Set([...Object.keys(before.subjects || {}), ...Object.keys(after.subjects || {})])]
      .map(subject => [subject, before.subjects?.[subject]?.formatters, after.subjects?.[subject]?.formatters])
  ]
  const lines = []
  for (const [column, from = {}, to = {}] of columns) {
    for (const name of new Set([...Object.keys(from), ...Object.keys(to)])) {
      if (from[name] === to[name]) continue
      const { label = name, invert = false } = labels[name] || {}
      lines.push(`設定表：「${label}」的${column}從「${cell(from[name], invert)}」改成「${cell(to[name], invert)}」`)
    }
  }
  return lines
}

/**
 * @description 比對線上的 matchTable.v2.json 與即將上傳的表，列出這次轉檔改了什麼，讓轉表者確認是不是預期的改動
 * （kb-1005721）。對答表停用的列不會輸出，與刪除分不出來，一律寫成「少了（停用或刪除）」。
 * @param {object|null} published - 線上的表；抓不到時傳 null
 * @param {object} matchTable - 即將上傳的表
 * @param {string[][]|null} settingsSheet - 設定表分頁，用來把開關換回表上的規則名稱
 * @returns {string[]} 一個變動一行
 */
const diffMatchTable = (published, matchTable, settingsSheet = null) => {
  if (!published) return ['抓不到線上的對答表，無法列出這次改了什麼']
  const lines = [
    ...Object.entries(KINDS).flatMap(([kind, label]) => __diffRows(label, published[kind], matchTable[kind])),
    ...__diffSwitches(published, matchTable, settingsSheet)
  ]
  return lines.length ? lines : ['和線上的對答表相比沒有變動']
}

module.exports = { diffMatchTable }

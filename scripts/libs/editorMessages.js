// 按「建議答案更新」後跳給編輯的訊息（kb-1005461）：只說成功或出錯，不出現 HTTP 狀態碼、SDK 版本、英文句子。
// 出錯分三種：
// - sheet：表填錯，編輯改得了；列出每個地方（分頁＋格子位置、填了什麼、怎麼改），一次全部列出
// - unavailable：連不上、讀不到試算表（錯誤帶 kind: 'unavailable'，見 sheetFetcher）；請編輯稍後再試
// - internal：其他系統問題；請編輯找工程
// 分頁名稱由 Apps Script 依分頁編號（gid）帶入（sheetNames），沒帶時用 SHEET_LABELS
const { getConfig } = require('./config')

const SHEET_LABELS = {
  settings: '設定表',
  fullMatch: '完整答案對答',
  partialMatch: '部分答案對答',
  variantMatch: '異體寫法'
}
const SHEET_GID_KEYS = {
  settings: 'FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS',
  fullMatch: 'FORMAT_RULE_SHEET_GID_FULL_MATCH',
  partialMatch: 'FORMAT_RULE_SHEET_GID_PARTIAL_MATCH',
  variantMatch: 'FORMAT_RULE_SHEET_GID_VARIANT_MATCH'
}
const MODE_LABELS = { TEST: '測試機', PROD: '正式機' }

// 欄位順序（0 起算）轉成試算表的欄名：0 → A、26 → AA
const columnName = (index) => {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name
  return name
}
// 格子位置，例：cellOf(10, 10) → 'K10'（rowNumber 為試算表上的列號）
const cellOf = (index, rowNumber) => `${columnName(index)}${rowNumber}`

const __WHITESPACE = /^[\s​]+$/
const __spaceName = (spaces) => /^　+$/.test(spaces) ? '全形空白' : '空白'
// 頭尾看不見的字元寫出來，例：' 123' → '（開頭有 1 個空白）'；沒有時回傳空字串
const invisibleNote = (text = '') => {
  if (text === '') return ''
  if (__WHITESPACE.test(text)) return `（整格都是空白，共 ${[...text].length} 個）`
  const notes = []
  const leading = text.match(/^[\s​]+/)?.[0]
  const trailing = text.match(/[\s​]+$/)?.[0]
  if (leading) notes.push(`開頭有 ${[...leading].length} 個${__spaceName(leading)}`)
  if (trailing) notes.push(`結尾有 ${[...trailing].length} 個${__spaceName(trailing)}`)
  const inner = text.trim()
  if (/[\r\n]/.test(inner)) notes.push('中間有換行')
  if (/[​-‍﻿]/.test(inner)) notes.push('有看不見的字元')
  return notes.length ? `（${notes.join('，')}）` : ''
}
// 加上引號並註明看不見的字元，例：quote(' 123') → '「 123」（開頭有 1 個空白）'
const quote = (text = '') => `「${text}」${invisibleNote(text)}`
// 只差在頭尾空白時，回傳要刪掉哪裡的空白（'開頭'、'結尾'、'開頭和結尾'），否則回傳 null
const extraSpaceAt = (filled, expected) => {
  if (filled === expected || filled.trim() !== expected) return null
  const leading = filled !== filled.trimStart()
  const trailing = filled !== filled.trimEnd()
  return leading && trailing ? '開頭和結尾' : leading ? '開頭' : '結尾'
}

// 表上一列的稱呼，例：'第 10 列「第一個數字前面會去空白」'
const rowLabel = (rowNumber, name) => `第 ${rowNumber} 列${name ? `「${name}」` : ''}`
// 列號清單的稱呼：[12, 13] → '第 12 列和第 13 列'、[3, 5, 8] → '第 3、5、8 列'
const rowsLabel = (rowNumbers) => {
  if (rowNumbers.length === 2) return `第 ${rowNumbers[0]} 列和第 ${rowNumbers[1]} 列`
  return `第 ${rowNumbers.join('、')} 列`
}

// 時間顯示成台北時間，例：'2026-11-02 10:30'
const taipeiTime = (time) => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
}).format(new Date(time))

// 編輯改得了的問題：{ sheet: SHEET_LABELS 的鍵, location: 位置（可空白）, text: 接在位置後面的說明, detail?: 只寫進 log 的處理過程 }
class SheetProblemsError extends Error {
  constructor(problems) {
    super(`Sheet problems, not uploaded:\n${problems.map(problem => renderProblem(problem)).join('\n')}`)
    this.kind = 'sheet'
    this.problems = problems
  }
}

const sheetNameOf = (sheet, sheetNames = {}) => {
  const gid = getConfig()[SHEET_GID_KEYS[sheet]]
  const name = gid ? sheetNames?.[gid] : null
  return typeof name === 'string' && name.trim() ? name : SHEET_LABELS[sheet] || sheet
}
const renderProblem = ({ sheet, location = '', text }, sheetNames) => `「${sheetNameOf(sheet, sheetNames)}」${location}${text}`

const NOT_UPLOADED = '更新失敗，這次沒有上傳。'

// 成功訊息，例：'更新完成（2026-11-02 10:30），測試機已套用。'
const successMessage = (updateTime, mode = getConfig().MODE) => `更新完成（${taipeiTime(updateTime)}），${MODE_LABELS[mode] || '測試機'}已套用。`

/**
 * @description job 失敗時給編輯看的訊息。
 * @param {Error & { kind?: string, problems?: object[] }} err
 * @param {Object<string, string>} [sheetNames] - 分頁編號（gid）→ 目前的分頁名稱，由 Apps Script 帶入
 * @param {number|Date} [now] - 發生時間（系統內部錯誤時顯示）
 * @returns {{ kind: 'sheet'|'unavailable'|'internal', message: string }}
 */
const failureMessage = (err, sheetNames, now = Date.now()) => {
  if (err?.kind === 'sheet' && err.problems?.length) {
    const lines = err.problems.map((problem, i) => `${i + 1}. ${renderProblem(problem, sheetNames)}`)
    return { kind: 'sheet', message: `${NOT_UPLOADED}請修正下面 ${lines.length} 個地方後再按一次：\n${lines.join('\n')}` }
  }
  if (err?.kind === 'unavailable') {
    return { kind: 'unavailable', message: `${NOT_UPLOADED}暫時連不上，請過幾分鐘再按一次；一直失敗請找工程。` }
  }
  return { kind: 'internal', message: `${NOT_UPLOADED}系統內部錯誤，請找工程（發生時間：${taipeiTime(now)}）。` }
}

module.exports = {
  SHEET_LABELS,
  SheetProblemsError,
  cellOf,
  columnName,
  extraSpaceAt,
  failureMessage,
  invisibleNote,
  quote,
  renderProblem,
  rowLabel,
  rowsLabel,
  successMessage,
  taipeiTime
}

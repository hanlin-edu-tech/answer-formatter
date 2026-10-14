const { parseFormatterSettings } = require('./formatterSettings')

const RULE_TABLE_PATH = 'v1/api/answerFormatter/ruleTable.json'
// 「預設」欄（舊表寫「全科」）輸出到 default，其餘欄位為科目
const DEFAULT_COLUMNS = ['預設', '全科']
// 勾選框讀出來是 TRUE / FALSE；也接受 Y / N。空白輸出 null（照較低優先層的設定）
const VALUES = { TRUE: true, FALSE: false, Y: true, N: false }

const __cell = (row, index) => (row?.[index] ?? '').toString().trim()
const __value = (row, index) => {
  const value = __cell(row, index).toUpperCase()
  return value === '' ? null : VALUES[value]
}

/**
 * @description 把「設定表」分頁照表上的樣子轉成 JSON：每列一條規則，帶「預設」欄與各科勾選。
 * 先用 match-table job 同一套解析檢查（規則名稱、重複、TRUE/FALSE），表寫錯時拋錯不輸出，
 * 確保 ruleTable.json 與 matchTable.v2.json 的開關出自同一份合法的表。
 * @param {string[][]} sheet
 * @param {number} [updateTime]
 * @returns {{ updateTime: number, subjects: string[], rules: { ruleName: string, default: boolean|null, subjects: Object<string, boolean|null> }[] }}
 */
const convertRuleTableSheet = (sheet = [], updateTime = Date.now()) => {
  if (!Array.isArray(sheet)) throw new Error('Rule table sheet must be a two-dimensional array')
  parseFormatterSettings(sheet)
  const rows = sheet.filter(row => Array.isArray(row) && row.some((_, i) => __cell(row, i) !== ''))
  if (!rows.length) throw new Error('Rule table sheet is empty')

  const [header, ...ruleRows] = rows
  const columns = []
  let defaultIndex = -1
  for (let i = 1; i < header.length; i++) {
    const subject = __cell(header, i)
    if (subject === '') continue
    if (DEFAULT_COLUMNS.includes(subject)) defaultIndex = i
    else columns.push({ index: i, subject })
  }

  const rules = ruleRows.map(row => ({
    ruleName: __cell(row, 0),
    default: defaultIndex === -1 ? null : __value(row, defaultIndex),
    subjects: Object.fromEntries(columns.map(({ index, subject }) => [subject, __value(row, index)]))
  }))
  return { updateTime, subjects: columns.map(column => column.subject), rules }
}

const exportRuleTable = async ({ getSheet, uploadToS3, gid, bucket, region, now = Date.now }) => {
  if (typeof getSheet !== 'function' || typeof uploadToS3 !== 'function') {
    throw new Error('Rule table export requires getSheet and uploadToS3 functions')
  }
  const ruleTable = convertRuleTableSheet(await getSheet(gid), now())
  const upload = await uploadToS3(ruleTable, RULE_TABLE_PATH, { bucket, region })
  if (!upload) throw new Error(`Failed to upload rule table to ${bucket}/${RULE_TABLE_PATH}`)
  return { ruleTable, location: upload.Location }
}

module.exports = { RULE_TABLE_PATH, convertRuleTableSheet, exportRuleTable }

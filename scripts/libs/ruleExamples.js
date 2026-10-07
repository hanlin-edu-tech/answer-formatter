const { KEEP_SWITCHES, switchOf } = require('./formatterSettings')

const RULE_COLUMN = '規則名稱'
const __cell = (row, index) => (row?.[index] ?? '').toString()

/**
 * @description 檢查「規則表」分頁的範例。每一列是一條規則的範例：第一欄規則名稱、第二欄標準寫法、
 * 其後為其他寫法。在全科設定下把這條規則打開時，其他寫法與標準寫法應判定相等；保留空白類的規則
 * （KEEP_SWITCHES）開啟時應判定不相等。把規則關掉後結果不變的範例沒有展示到規則，只列為警告。
 * @param {object} sdk - answerFormatter SDK（需支援 equals 與 matchTable 的 formatters 開關）
 * @param {object} matchTable - 即將上傳的 matchTable.v2.json
 * @param {string[][]} sheet
 * @returns {{ failures: string[], warnings: string[] }}
 */
const checkRuleExamples = (sdk, matchTable = {}, sheet = []) => {
  const failures = []
  const warnings = []
  const rows = sheet.filter(row => row.some((_, i) => __cell(row, i).trim() !== ''))
  if (!rows.length) return { failures, warnings }
  if (__cell(rows[0], 0).trim() !== RULE_COLUMN) {
    return { failures: [`Rule examples sheet: first header must be "${RULE_COLUMN}"`], warnings }
  }

  const original = sdk.matchTable
  // SDK 依 matchTable 物件快取規則，每種開關組合各建一個物件
  const tables = {}
  const tableWith = (name, enabled) => {
    const key = `${name}:${enabled}`
    if (!tables[key]) tables[key] = { ...matchTable, formatters: { ...(matchTable.formatters || {}), [name]: enabled } }
    return tables[key]
  }
  const judge = (name, enabled, a, b) => {
    sdk.matchTable = tableWith(name, enabled)
    return sdk.equals(a, b)
  }

  try {
    rows.slice(1).forEach((row, rowIndex) => {
      const rowNumber = rowIndex + 2
      const label = __cell(row, 0).trim()
      const name = switchOf(label)
      if (!name) {
        failures.push(`第 ${rowNumber} 列：不認得的規則「${label}」`)
        return
      }
      const standard = __cell(row, 1)
      const others = row.slice(2).map((_, i) => __cell(row, i + 2)).filter(text => text.trim() !== '')
      if (!others.length) {
        failures.push(`第 ${rowNumber} 列「${label}」：沒有其他寫法`)
        return
      }
      const expectEqual = !KEEP_SWITCHES.includes(name)
      for (const other of others) {
        const on = judge(name, true, standard, other)
        if (on !== expectEqual) {
          failures.push(`第 ${rowNumber} 列「${label}」：「${standard}」與「${other}」開啟時應判定${expectEqual ? '相等' : '不相等'}，實際${on ? '相等' : '不相等'}`)
          continue
        }
        if (judge(name, false, standard, other) === on) {
          warnings.push(`第 ${rowNumber} 列「${label}」：「${standard}」與「${other}」關閉規則時結果相同，範例沒有展示到這條規則`)
        }
      }
    })
  } finally {
    sdk.matchTable = original
  }
  return { failures, warnings }
}

module.exports = { checkRuleExamples }

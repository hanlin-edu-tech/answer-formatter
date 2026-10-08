const KINDS = { fullMatch: '完整對答', partialMatch: '部分對答' }

/**
 * @description 檢查對答表每一列是否真的生效：在勾選的每個科目（與不帶科目）下，每個輸入答案
 * 應與標準答案判定相等；部分對答另檢查放進較長答案時也相等。不相等的列多半是被其他規則
 * 先改掉，或部分對答改寫後撞上完整對答的標準答案而被還原（例：'無煙囪產業' → '觀光業'）。
 * 有些情況可能是刻意的，因此只列為警告、不擋上傳。
 * @param {object} sdk - answerFormatter SDK
 * @param {object} matchTable - 即將上傳的 matchTable.v2.json
 * @returns {string[]} 警告訊息；同一列在多個科目不生效時合併成一則
 */
const checkRuleEffect = (sdk, matchTable = {}) => {
  const original = sdk.matchTable
  const scopes = [null, ...(matchTable.ruleSubjects || [])]
  const failed = new Map()
  try {
    sdk.matchTable = matchTable
    for (const [kind, label] of Object.entries(KINDS)) {
      for (const { primeText = '', matchText = [], subjects } of matchTable[kind] || []) {
        for (const scope of scopes) {
          if (scope && subjects && !subjects.includes(scope)) continue
          const options = scope ? { subject: scope } : undefined
          for (const text of matchText) {
            const standalone = sdk.equals(text, primeText, options)
            const inSentence = kind === 'fullMatch' || sdk.equals(`甲${text}乙`, `甲${primeText}乙`, options)
            if (standalone && inSentence) continue
            const key = `${label}｜${primeText}｜${text}｜${standalone ? '句中' : '單獨'}`
            if (!failed.has(key)) failed.set(key, [])
            failed.get(key).push(scope || '不帶科目')
          }
        }
      }
    }
  } finally {
    sdk.matchTable = original
  }
  return [...failed.entries()].map(([key, scopeList]) => {
    const [label, primeText, text, where] = key.split('｜')
    const position = where === '單獨' ? '單獨作答時' : '放在較長答案裡時'
    return `${label}「${text}」${position}與標準答案「${primeText || '（刪除）'}」判定不相等〔${scopeList.join('、')}〕`
  })
}

module.exports = { checkRuleEffect }

// 部分對答的套用方式與 SDK 相同（src/libs/formatters.js 的 __applyPartialRules，sc-134172）：
// 每個位置取最長的輸入答案、反覆套用到不再變動；擴寫規則的標準答案視為整段、不再擴寫。
// 這裡用表上的原始字串模擬，找出彼此改來改去而不會收斂的規則（例：'劃' ← '畫' 與 '計畫' ← '計劃'）。
// SDK 遇到循環時仍會給出與列順序無關的結果，但那個結果不一定是編輯要的，所以 job 上傳前擋下
const MAX_ROUNDS = 20

const __patterns = (rules) => {
  const patterns = []
  for (const { primeText = '', matchText = [] } of rules) {
    const texts = matchText.filter(text => text && text !== primeText)
    for (const text of texts) patterns.push({ text, prime: primeText, identity: false })
    if (primeText && texts.some(text => primeText.includes(text))) patterns.push({ text: primeText, prime: primeText, identity: true })
  }
  return patterns.sort((a, b) => b.text.length - a.text.length || a.identity - b.identity || (a.prime < b.prime ? -1 : a.prime > b.prime ? 1 : 0))
}

// 回傳循環經過的字串（不循環時回傳 null）
const __cycleOf = (input, patterns) => {
  const seen = [input]
  let answer = input
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let result = ''
    let changed = false
    for (let i = 0; i < answer.length;) {
      const pattern = patterns.find(({ text }) => answer.startsWith(text, i))
      if (!pattern) {
        result += answer[i]
        i++
        continue
      }
      result += pattern.prime
      i += pattern.text.length
      if (!pattern.identity) changed = true
    }
    if (!changed) return null
    if (seen.includes(result)) return seen.slice(seen.indexOf(result))
    seen.push(result)
    answer = result
  }
  return seen.slice(-2)
}

/**
 * @description 找出部分對答規則中的循環。分科規則依勾選的科目各自檢查，另檢查不帶科目（套用所有列）。
 * @param {object[]} rules - matchTable.v2.json 的 partialMatch（可帶 subjects）
 * @param {string[]} [subjects] - 表上的科目欄
 * @returns {string[]} 每個循環一則說明；沒有循環時為空陣列
 */
const findPartialCycles = (rules = [], subjects = []) => {
  const messages = []
  const reported = new Set()
  for (const subject of [null, ...subjects]) {
    const scoped = rules.filter(rule => !subject || !rule.subjects || rule.subjects.includes(subject))
    const patterns = __patterns(scoped)
    const inputs = [...new Set(scoped.flatMap(({ primeText = '', matchText = [] }) => [primeText, ...matchText]).filter(Boolean))]
    for (const input of inputs) {
      const cycle = __cycleOf(input, patterns)
      if (!cycle) continue
      const key = [...cycle].sort().join('|')
      if (reported.has(key)) continue
      reported.add(key)
      messages.push(`部分對答規則循環${subject ? `〔${subject}〕` : ''}：${[...cycle, cycle[0]].join(' → ')}`)
    }
  }
  return messages
}

module.exports = { findPartialCycles }

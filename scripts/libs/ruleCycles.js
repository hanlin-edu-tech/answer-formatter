// 部分對答的套用方式與 SDK 相同（src/libs/formatters.js 的 __applyPartialRules，sc-134172）：
// 每個位置取最長的輸入答案、反覆套用到不再變動；擴寫規則的標準答案視為整段、不再擴寫。
// 這裡用表上的原始字串模擬，找出彼此改來改去而不會收斂的規則（例：'劃' ← '畫' 與 '計畫' ← '計劃'）。
// SDK 遇到循環時仍會給出與列順序無關的結果，但那個結果不一定是編輯要的，所以 job 上傳前擋下
const { rowsLabel } = require('./editorMessages')
const { subjectName } = require('./formatterSettings')

const MAX_ROUNDS = 20

// rules 為 { rule, index }：index 是在整張表 partialMatch 的位置，用來對回列號
const __patterns = (rules) => {
  const patterns = []
  for (const { rule: { primeText = '', matchText = [] }, index } of rules) {
    const texts = matchText.filter(text => text && text !== primeText)
    for (const text of texts) patterns.push({ text, prime: primeText, identity: false, index })
    if (primeText && texts.some(text => primeText.includes(text))) patterns.push({ text: primeText, prime: primeText, identity: true, index })
  }
  return patterns.sort((a, b) => b.text.length - a.text.length || a.identity - b.identity || (a.prime < b.prime ? -1 : a.prime > b.prime ? 1 : 0))
}

// 回傳循環經過的字串與造成循環的規則位置（不循環時回傳 null）
const __cycleOf = (input, patterns) => {
  const seen = [input]
  // 每一輪實際改寫用到的規則位置；第 r 輪把 seen[r] 改成 seen[r + 1]
  const rounds = []
  const cycleFrom = start => ({ texts: seen.slice(start), indexes: [...new Set(rounds.slice(start).flat())] })
  let answer = input
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let result = ''
    let changed = false
    const used = []
    for (let i = 0; i < answer.length;) {
      const pattern = patterns.find(({ text }) => answer.startsWith(text, i))
      if (!pattern) {
        result += answer[i]
        i++
        continue
      }
      result += pattern.prime
      i += pattern.text.length
      if (!pattern.identity) {
        changed = true
        used.push(pattern.index)
      }
    }
    if (!changed) return null
    rounds.push(used)
    if (seen.includes(result)) return cycleFrom(seen.indexOf(result))
    seen.push(result)
    answer = result
  }
  return cycleFrom(seen.length - 2)
}

/**
 * @description 找出部分對答規則中的循環。分科規則依勾選的科目各自檢查，另檢查不帶科目（套用所有列）。
 * @param {object[]} rules - matchTable.v2.json 的 partialMatch（可帶 subjects）
 * @param {string[]} [subjects] - 表上的科目欄
 * @param {number[]} [rowNumbers] - 每條規則在分頁上的列號（與 rules 一一對應，見 parseMatchSheet）；沒帶時訊息不寫列號
 * @returns {{ sheet: string, location: string, text: string }[]} 每個循環一則給編輯看的問題（見 editorMessages）；沒有循環時為空陣列
 */
const findPartialCycles = (rules = [], subjects = [], rowNumbers = []) => {
  const problems = []
  const reported = new Set()
  const indexed = rules.map((rule, index) => ({ rule, index }))
  for (const subject of [null, ...subjects]) {
    const scoped = indexed.filter(({ rule }) => !subject || !rule.subjects || rule.subjects.includes(subject))
    const patterns = __patterns(scoped)
    const inputs = [...new Set(scoped.flatMap(({ rule: { primeText = '', matchText = [] } }) => [primeText, ...matchText]).filter(Boolean))]
    for (const input of inputs) {
      const cycle = __cycleOf(input, patterns)
      if (!cycle) continue
      const key = [...cycle.texts].sort().join('|')
      if (reported.has(key)) continue
      reported.add(key)
      const rows = [...new Set(cycle.indexes.map(index => rowNumbers[index]).filter(Boolean))].sort((a, b) => a - b)
      const where = subject ? `在${subjectName(subject)}` : ''
      const chain = `（${[...cycle.texts, cycle.texts[0]].join('→')}）`
      problems.push({
        sheet: 'partialMatch',
        location: rows.length ? rowsLabel(rows) : '',
        text: rows.length === 1
          ? `${where}會一直改寫自己${chain}，請檢查這一列。`
          : `${rows.length ? '' : '有幾列'}${where}互相改寫${chain}，請刪掉其中一列。`
      })
    }
  }
  return problems
}

module.exports = { findPartialCycles }

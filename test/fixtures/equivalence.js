/**
 * 等價類基準：比對「哪些答案彼此判定相等」，而不是每個字串的格式化輸出。
 *
 * formatBaseline.json 只記錄輸出字串，輸出改變但判定不變（例如改了 canonical 寫法）
 * 也會被當成漂移，卻抓不到兩個不同群組的字串變得相等。這裡把輸入依 format() 結果
 * 分組，新舊分組的差異才是批改行為的改變。
 */
const expected = require('./expectedChanges.json')

// 表上所有字串 + expectedChanges 的探針詞組
const collectInputs = (matchTable) => {
  const inputs = new Set()
  for (const kind of ['variantMatch', 'fullMatch', 'partialMatch']) {
    for (const { primeText = '', matchText = [] } of matchTable[kind] || []) {
      for (const text of [primeText, ...matchText]) {
        if (text !== '') inputs.add(text)
      }
    }
  }
  for (const list of [expected.groups, expected.pairs, expected.longAnswers, expected.partialOrderFixes || [], expected.negatives]) {
    for (const row of list) row.forEach(text => inputs.add(text))
  }
  return [...inputs]
}

// 回傳 [[同一等價類的輸入...], ...]，只保留兩個以上成員的類
const buildClasses = (answerFormatter, inputs) => {
  const byOutput = new Map()
  for (const input of inputs) {
    const output = answerFormatter.format(input)
    if (!byOutput.has(output)) byOutput.set(output, [])
    byOutput.get(output).push(input)
  }
  return [...byOutput.values()].filter(members => members.length > 1).map(members => members.sort())
}

const __unionFind = () => {
  const parent = new Map()
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x)
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)))
      x = parent.get(x)
    }
    return x
  }
  const union = (a, b) => parent.set(find(a), find(b))
  return { find, union }
}

// groups 內的寫法全換成該組第一個寫法（長的先換，避免短詞先吃掉長詞的一部分）
const __substitute = (text) => {
  const rules = expected.groups
    .flatMap(group => group.map(member => [member, group[0]]))
    .sort((a, b) => b[0].length - a[0].length)
  let result = ''
  let i = 0
  outer: while (i < text.length) {
    for (const [from, to] of rules) {
      if (text.startsWith(from, i)) {
        result += to
        i += from.length
        continue outer
      }
    }
    result += text[i++]
  }
  return result
}

/**
 * 比較新舊等價類，回傳：
 * - unexpectedMerges：新判定相等、但無法用舊等價類 + expectedChanges 解釋的配對（可能的誤判）
 * - splits：舊判定相等、新判定不相等的配對（由對轉錯）
 * - negativeHits：negatives 被判為相等
 */
const diffClasses = (answerFormatter, baselineClasses, inputs) => {
  const oldOf = new Map()
  baselineClasses.forEach((members, i) => members.forEach(m => oldOf.set(m, i)))
  const sameOld = (a, b) => oldOf.has(a) && oldOf.get(a) === oldOf.get(b)

  // 預期模型：舊等價類 ∪ 群組替換後相同 ∪ 明列的配對與長答案，取遞移閉包
  const model = __unionFind()
  baselineClasses.forEach(members => members.forEach(m => model.union(m, members[0])))
  const bySubstitute = new Map()
  for (const input of inputs) {
    const key = __substitute(input)
    if (bySubstitute.has(key)) model.union(input, bySubstitute.get(key))
    else bySubstitute.set(key, input)
  }
  for (const row of [...expected.pairs, ...expected.longAnswers, ...(expected.partialOrderFixes || [])]) row.forEach(text => model.union(text, row[0]))

  const outputOf = new Map(inputs.map(input => [input, answerFormatter.format(input)]))
  const unexpectedMerges = []
  const splits = []
  for (let i = 0; i < inputs.length; i++) {
    for (let j = i + 1; j < inputs.length; j++) {
      const a = inputs[i]
      const b = inputs[j]
      const nowEqual = outputOf.get(a) === outputOf.get(b)
      if (nowEqual && !sameOld(a, b) && model.find(a) !== model.find(b)) unexpectedMerges.push([a, b])
      if (!nowEqual && sameOld(a, b)) splits.push([a, b])
    }
  }
  const negativeHits = expected.negatives.filter(([a, b]) => answerFormatter.equals(a, b))
  return { unexpectedMerges, splits, negativeHits }
}

module.exports = { expected, collectInputs, buildClasses, diffClasses }

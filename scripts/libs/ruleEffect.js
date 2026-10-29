const KINDS = { fullMatch: '完整答案對答表', partialMatch: '部分答案對答表' }
// 提醒裡的規則名稱，對齊設定表的規則名稱；synonymsFormatter 改列出命中的對答表寫法（見 __tableLines）
const STEP_LABELS = {
  fullwidthFormatter: '全形轉半形',
  latexFormatter: 'LaTeX 方程式轉成一般寫法',
  caseFormatter: '大小寫互通',
  removeSpaceFormatter: '空白整理',
  removeNumberingFormatter: '去題號',
  yearFormatter: '年代寫法互通',
  interpunctFormatter: '間隔號互通',
  arrowFormatter: '排序答案的箭頭可有可無',
  removeTailPeriodFormatter: '答案最後的句號可有可無',
  numberFormatter: '去逗號判斷',
  englishQuoteFormatter: '最外層成對引號可有可無',
  outerBracketFormatter: '最外層括號可有可無',
  phoneticFormatter: '注音的一聲符號可有可無'
}
const STRUCTURE_LABELS = {
  answerOrder: '多個答案順序可互換',
  mathPlusMinus: '± 可視同正負兩個答案',
  mathFactorOrder: '括號因式順序可互換'
}

// 改變這個答案的答案結構規則：逐條關掉，結果跟著變的就是它
const __structureRulesOf = (sdk, matchTable, text, options) => {
  const normalized = sdk.explain(text, options).normalized
  const names = []
  try {
    for (const name of Object.keys(STRUCTURE_LABELS)) {
      const subjects = Object.fromEntries(Object.entries(matchTable.subjects || {})
        .map(([subject, value]) => [subject, { ...value, formatters: { ...value.formatters, [name]: false } }]))
      sdk.matchTable = { ...matchTable, formatters: { ...matchTable.formatters, [name]: false }, subjects }
      if (sdk.explain(text, options).normalized !== normalized) names.push(name)
    }
  } finally {
    sdk.matchTable = matchTable
  }
  return names
}

const __replaceText = ({ primeText, matchedText }) => primeText === '' ? `刪掉「${matchedText}」` : `把「${matchedText}」換成「${primeText}」`
// 整個答案就是被換掉的那段時，後半句「X 變成 Y」只是重複，不寫
const __hitLine = (table, hit) => `${table}：${__replaceText(hit)}${hit.before === hit.matchedText ? '' : `，「${hit.before}」變成「${hit.after}」`}`
const __values = values => values.map(value => `「${value}」`).join('')

// 對答表命中的每一列各寫一行；部分答案對答改寫後撞上完整答案對答的標準寫法時，另寫一行說明被改回
const __tableLines = (trace, before, after) => {
  const lines = (trace.variantMatch || []).map(hit => __hitLine('內建異體字對照', hit))
  const { fullMatch } = trace
  // 本來就是完整答案對答的標準寫法時沒有改寫，不列出
  if (fullMatch && fullMatch.matchedText !== fullMatch.primeText) {
    lines.push(`完整答案對答表：整個答案「${fullMatch.matchedText}」等於這列的其他寫法，換成標準寫法「${fullMatch.primeText}」`)
  }
  const partials = trace.partialMatch || []
  for (const hit of partials) lines.push(__hitLine('部分答案對答表', hit))
  if (partials.some(hit => hit.reverted)) {
    lines.push(`部分答案對答表的改寫被取消：結果「${partials[partials.length - 1].after}」剛好是完整答案對答表某列的標準寫法，改回「${after}」`)
  }
  if (!lines.length && before !== after) lines.push(`對答表：「${before}」變成「${after}」`)
  return lines
}

// 答案的處理過程，一個步驟一行，最後一行是實際拿來比對的值。
// 答案結構規則（多個答案順序可互換等）不接在前面步驟後面：它回頭拿原答案拆成多個答案，前面的結果不會用上，
// 拆出來的答案比對時不分順序，所以列出各個答案而不是程式內部排序後的字串（否則讀起來像「甲、乙」變成「乙、甲」）
const __describe = (sdk, matchTable, text, options) => {
  const trace = sdk.explain(text, options)
  const lines = []
  for (const { formatter, enabled, before, after } of trace.steps) {
    if (!enabled || formatter === 'toStringFormatter') continue
    if (formatter === 'synonymsFormatter') {
      lines.push(...__tableLines(trace, before, after))
      continue
    }
    if (before !== after) lines.push(`規則「${STEP_LABELS[formatter] || formatter}」：「${before}」變成「${after}」`)
  }
  let compared = `「${trace.normalized}」`
  const { structure } = trace
  if (structure && structure.after !== structure.before) {
    const names = __structureRulesOf(sdk, matchTable, text, options)
    const rules = names.length ? names.map(name => `「${STRUCTURE_LABELS[name]}」`).join('') : '「答案結構整理」'
    // 程式內部為了不分順序比對，會把拆出來的答案排序；顯示時照原答案出現的順序排回來
    const position = value => (text.indexOf(value) + 1) || Infinity
    const values = structure.after.split('、').sort((a, b) => position(a) - position(b))
    const result = values.length > 1 ? `拆成 ${values.length} 個答案${__values(values)}` : `整理成「${structure.after}」`
    const source = names.includes('answerOrder') && lines.length ? `不採用上一步的結果，改從原答案「${text}」` : `把「${structure.before}」`
    lines.push(`規則${rules}：${source}${result}`)
    if (values.length > 1) compared = `${values.length} 個答案${__values(values)}${names.includes('answerOrder') ? '（比對時不分順序）' : ''}`
  }
  const steps = lines.length ? lines.map((line, index) => `　${index + 1}. ${line}`) : ['　沒有被改寫']
  return [...steps, `　最後拿來比對：${compared}`].join('\n')
}

// 不相等的原因：兩邊各自經過哪些步驟、最後拿什麼比對；SDK 沒有 explain() 時回傳空字串
const __reason = (sdk, matchTable, text, primeText, options) => {
  if (typeof sdk.explain !== 'function') return ''
  return [
    `學生寫法「${text}」`, __describe(sdk, matchTable, text, options),
    `標準答案「${primeText}」`, __describe(sdk, matchTable, primeText, options)
  ].join('\n')
}

/**
 * @description 檢查對答表每一列是否真的生效：在勾選的每個科目（與不帶科目）下，每個輸入答案
 * 應與標準答案判定相等；部分對答另檢查放進較長答案時也相等。不相等的列多半是被其他規則
 * 先改掉，或部分對答改寫後撞上完整對答的標準答案而被還原（例：'無煙囪產業' → '觀光業'）。
 * 提醒附上兩邊各自經過哪些規則、最後變成什麼，看得出是哪條規則搶先處理。
 * 有些情況可能是刻意的，因此只列為警告、不擋上傳。
 * @param {object} sdk - answerFormatter SDK
 * @param {object} matchTable - 即將上傳的 matchTable.v2.json
 * @returns {string[]} 警告訊息；同一列在多個科目不生效且原因相同時合併成一則
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
            // equals() 第一個參數放標準答案（多個答案順序可互換時兩邊不對稱，kb-1005287）。
            // 刪除類的列（標準寫法空白）代表「可有可無」，兩個方向任一個相等就算生效：國文「刪掉頓號」只在
            // 標準答案帶頓號、學生不帶時成立，反過來（標準「國父」、學生「國、父」）本來就不算對
            const equals = (standard, answer) => sdk.equals(standard, answer, options) || (primeText === '' && sdk.equals(answer, standard, options))
            const standalone = equals(primeText, text)
            const inSentence = kind === 'fullMatch' || equals(`甲${primeText}乙`, `甲${text}乙`)
            if (standalone && inSentence) continue
            const reason = standalone
              ? __reason(sdk, matchTable, `甲${text}乙`, `甲${primeText}乙`, options)
              : __reason(sdk, matchTable, text, primeText, options)
            const key = `${label}｜${primeText}｜${text}｜${standalone ? '句中' : '單獨'}｜${reason}`
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
    const [label, primeText, text, where, reason] = key.split('｜')
    const position = where === '單獨' ? '單獨作答時' : '放在較長答案裡時（以「甲…乙」檢查）'
    const summary = `${label}「${text}」${position}與標準答案「${primeText || '（刪除）'}」判定不相等〔${scopeList.join('、')}〕`
    return reason ? `${summary}\n${reason}` : summary
  })
}

module.exports = { checkRuleEffect, describeAnswer: __describe, explainNotEqual: __reason }

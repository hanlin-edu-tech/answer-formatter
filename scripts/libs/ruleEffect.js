const KINDS = { fullMatch: '完整答案對答表', partialMatch: '部分答案對答表' }
// 提醒裡的規則名稱，對齊設定表的規則名稱；synonymsFormatter 改列出命中的對答表寫法（見 __describe）
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
const TABLE_LABELS = { variantMatch: '內建異體字對照', fullMatch: '完整答案對答', partialMatch: '部分答案對答' }

const __hit = (kind, { primeText, matchedText, reverted }) =>
  `${TABLE_LABELS[kind]}「${primeText || '（刪除）'}」←「${matchedText}」${reverted ? '（撞上完整答案對答的標準答案，改寫被還原）' : ''}`

// 答案在每個步驟被改成什麼：「甲.乙」→ 間隔號互通 →「甲·乙」→ 部分答案對答「˙」←「·」→「甲˙乙」
const __describe = (sdk, text, options) => {
  const trace = sdk.explain(text, options)
  const parts = [`「${text}」`]
  for (const { formatter, enabled, before, after } of trace.steps) {
    if (!enabled || formatter === 'toStringFormatter') continue
    // 對答表改寫被還原時結果不變，仍列出命中的寫法
    if (formatter === 'synonymsFormatter') {
      const hits = [
        ...(trace.variantMatch || []).map(hit => __hit('variantMatch', hit)),
        // 本來就是完整答案對答的標準寫法時沒有改寫，不列出
        ...(trace.fullMatch && trace.fullMatch.matchedText !== trace.fullMatch.primeText ? [__hit('fullMatch', trace.fullMatch)] : []),
        ...(trace.partialMatch || []).map(hit => __hit('partialMatch', hit))
      ]
      if (before !== after || hits.length) parts.push(`→ ${hits.length ? hits.join('、') : '對答表'} →「${after}」`)
      continue
    }
    if (before === after) continue
    parts.push(`→ ${STEP_LABELS[formatter] || formatter} →「${after}」`)
  }
  if (trace.structure && trace.structure.after !== trace.structure.before) parts.push(`→ 答案結構整理 →「${trace.structure.after}」`)
  return parts.length > 1 ? parts.join(' ') : `「${text}」沒有被改寫`
}

// 答案結構整理是哪一條規則造成不相等：逐條關掉，關掉後相等的就是它
const __structureCauses = (sdk, matchTable, a, b, options) => {
  const causes = []
  try {
    for (const [name, label] of Object.entries(STRUCTURE_LABELS)) {
      const subjects = Object.fromEntries(Object.entries(matchTable.subjects || {})
        .map(([subject, value]) => [subject, { ...value, formatters: { ...value.formatters, [name]: false } }]))
      sdk.matchTable = { ...matchTable, formatters: { ...matchTable.formatters, [name]: false }, subjects }
      if (sdk.equals(a, b, options)) causes.push(label)
    }
  } finally {
    sdk.matchTable = matchTable
  }
  return causes
}

// 不相等的原因：兩邊各自經過哪些規則、最後變成什麼；SDK 沒有 explain() 時回傳空字串
const __reason = (sdk, matchTable, text, primeText, options) => {
  if (typeof sdk.explain !== 'function') return ''
  const lines = [`學生寫法：${__describe(sdk, text, options)}`, `標準答案：${__describe(sdk, primeText, options)}`]
  if ([text, primeText].some(value => {
    const { structure } = sdk.explain(value, options)
    return structure && structure.after !== structure.before
  })) {
    const causes = __structureCauses(sdk, matchTable, text, primeText, options)
    if (causes.length) lines.push(`原因：「${causes.join('」「')}」先把答案整理成結構（例：頓號當成多個答案的分隔），對答表的改寫沒有用上`)
  }
  return lines.join('\n')
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
            const standalone = sdk.equals(text, primeText, options)
            const inSentence = kind === 'fullMatch' || sdk.equals(`甲${text}乙`, `甲${primeText}乙`, options)
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

module.exports = { checkRuleEffect }

const stringFormUtils =  require('string-form-utils')
const latex = require('./latex.js')

const toStringFormatter = function (answer) {
	return answer.toString()
}

const fullwidthFormatter = function (answer) {
	return stringFormUtils.transformToHalfwidth(answer)
}

const toLowerCaseFormatter = function (answer) {
	return answer.toLowerCase()
}

// 科目設定來自 matchTable.subjects[subject]；未帶科目或表上沒有該科時回傳 null，走全科通用規則
const __subjectConfig = function (answerFormatter, options) {
	const subject = options?.subject
	if (subject === undefined || subject === null || subject === '') return null
	return answerFormatter?.matchTable?.subjects?.[subject] || null
}

// 英文字母不分大小寫，預設關閉（見 __DEFAULT_SWITCHES）。
// 只轉 A-Z：希臘字母大小寫在數理是不同符號（Δ 與 δ），不能跟著轉。
// 排在 latexFormatter 之後，\Delta 這類指令名稱才不會先被轉成小寫而線性化失敗
const caseFormatter = function (answer) {
	return answer.replace(/[A-Z]/g, letter => letter.toLowerCase())
}

const __LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/
// 英文單字間的空白有意義（例：'a part' 與 'apart'），兩側都是英文字母時縮成一個空白；
// 其餘空白一律刪除（中文字間、數字與單位間、標點旁）。
// 不用 lookbehind：iOS 15 不支援
const removeSpaceFormatter = function (answer) {
	return answer.replace(/[\u0000-\u0020\u007F\u200B\s]+/g, (match, offset, wholeStr) => {
		const before = wholeStr[offset - 1] || ''
		const after = wholeStr[offset + match.length] || ''
		return __LATIN_LETTER.test(before) && __LATIN_LETTER.test(after) ? ' ' : ''
	})
}


// 同一群組內所有被視為等價的寫法；primeText 為空字串的規則（刪除符號）不列入
const __relatedAnswers = function (primeText, matchText = []) {
	return [primeText, ...matchText].filter(text => text !== '')
}
// primeText 保留表上原字串供 explain() 回報；formattedPrimeText / formattedMatchText
// 為前處理後的比對用字串，matchText 依處理後長度由長到短排序（取第一個命中）
const __prepareRules = function (rules = [], formatText) {
	return rules.map(({ primeText = '', matchText = [] }) => {
		const formattedPrimeText = formatText(primeText)
		const formattedMatchText = [...new Set(matchText.map(formatText))]
			// 前處理後與 primeText 相同或變成空字串的寫法不會改變答案，直接剔除
			// （例：'\left(' 線性化後是 '('、fullMatch '惰性氣體←鈍氣' 經 variantMatch 後是恆等）
			.filter(text => text !== '' && text !== formattedPrimeText)
			.sort((a, b) => b.length - a.length)
		return { primeText, matchText, formattedPrimeText, formattedMatchText }
	})
}
const __applyRules = function (answer, rules = [], hits) {
	for (const { primeText, matchText, formattedPrimeText, formattedMatchText } of rules) {
		if (answer !== formattedPrimeText) {
			for (const formattedText of formattedMatchText) {
				if (answer.includes(formattedText)) {
					const replaced = answer.replaceAll(formattedText, formattedPrimeText)
					hits?.push({
						primeText,
						matchedText: formattedText,
						before: answer,
						after: replaced,
						relatedAnswers: __relatedAnswers(primeText, matchText),
						reverted: false
					})
					answer = replaced
					break
				}
			}
		}
	}
	return answer
}
// formatter 開關：該科有 matchTable.subjects[科目].formatters（即使是空物件）就只用它，
// 沒有時退回 matchTable.formatters（全科）；兩者都沒寫到的 formatter 沿用這裡的預設。
// 全科只是找不到該科設定時的 fallback，不會疊加到有設定的科目上。
// 順序固定在 formatters 陣列，表只決定開或關。
// toStringFormatter、synonymsFormatter 不在此列，一律執行（不想套同義詞就讓該科規則表為空）
const __DEFAULT_SWITCHES = {
	fullwidthFormatter: true,
	latexFormatter: true,
	caseFormatter: false,
	removeSpaceFormatter: true,
	yearFormatter: true,
	interpunctFormatter: true,
	arrowFormatter: true,
	removeTailPeriodFormatter: true,
	phoneticFormatter: true
}
// 只採用認得的 formatter 名稱且值為布林；其餘忽略，表上打錯字不會讓 SDK 出錯
const __pickSwitches = function (switches) {
	const picked = {}
	for (const [name, enabled] of Object.entries(switches || {})) {
		if (name in __DEFAULT_SWITCHES && typeof enabled === 'boolean') picked[name] = enabled
	}
	return picked
}

// 依表物件與科目快取「啟用的 formatter」與前處理後的規則；updateMatchTable() 與測試都是整個
// 換掉 matchTable 物件，不會就地修改內容。表上沒有的科目共用全科那份（key ''），不會因呼叫端
// 傳入任意科目而長出快取
const __profiles = new WeakMap()
const __RULE_KINDS = ['variantMatch', 'fullMatch', 'partialMatch']
const __profile = function (answerFormatter, options) {
	const matchTable = answerFormatter?.matchTable || {}
	const subjectConfig = __subjectConfig(answerFormatter, options)
	const cacheKey = subjectConfig ? options.subject : ''
	if (!__profiles.has(matchTable)) __profiles.set(matchTable, new Map())
	const tableCache = __profiles.get(matchTable)
	if (tableCache.has(cacheKey)) return tableCache.get(cacheKey)

	const switches = { ...__DEFAULT_SWITCHES, ...__pickSwitches(subjectConfig?.formatters || matchTable.formatters) }
	const enabled = formatters.filter(formatter => switches[formatter.formatterName] !== false)

	// 表上字串要走與答案相同的前處理，才比得到（例：'Freeway No. 5' → 'Freeway No.5'、
	// '1980s' → '1980年代'）。前處理 = 該科啟用的 formatter 中 synonymsFormatter 以前的項目
	// + variantMatch
	const preSynonymsFormatters = enabled.slice(0, enabled.indexOf(synonymsFormatter))
	const preformat = text => preSynonymsFormatters.reduce((result, formatter) => formatter(result), text)

	// 分科規則排在全科通用規則之前：fullMatch 取第一個命中，同一個寫法兩邊都有時以分科為準
	const rules = {}
	for (const kind of __RULE_KINDS) {
		rules[kind] = [...(subjectConfig?.[kind] || []), ...(matchTable[kind] || [])]
	}
	const variantMatch = __prepareRules(rules.variantMatch, preformat)
	const formatText = text => __applyRules(preformat(text), variantMatch)
	const profile = {
		enabled,
		rules: {
			variantMatch,
			fullMatch: __prepareRules(rules.fullMatch, formatText),
			partialMatch: __prepareRules(rules.partialMatch, formatText)
		}
	}
	tableCache.set(cacheKey, profile)
	return profile
}
/**
 * 三層規則，依序套用：
 * 1. variantMatch：任何上下文都等價的寫法（異體字、譯名、同義專有名詞），答案與表上
 *    所有字串都先過這層，fullMatch 的 matchText 因此也吃得到（例：夏雨型暖溼／暖濕）
 * 2. fullMatch：整串相符才替換成 primeText
 * 3. partialMatch：子字串改寫（縮短類規則），改寫後撞上 fullMatch primeText 時還原
 * 帶科目時，該科的三層規則分別接在全科通用規則之前一起套用（見 __profile）。
 * @param {string} answer
 * @param {object} answerFormatter
 * @param {object} [trace] - 由 explain() 傳入，收集命中的規則；format() 不傳，行為不變。
 * @param {{ subject?: string }} [options]
 */
const synonymsFormatter = function (answer, answerFormatter, trace, options) {
	const { variantMatch, fullMatch, partialMatch } = __profile(answerFormatter, options).rules

	answer = __applyRules(answer, variantMatch, trace?.variantMatch)

	// fullMatch 命中後 primeText 仍要過 partialMatch：否則同群組的兩種寫法會走到
	// 不同結果（primeText 本身會被 partialMatch 改寫，matchText 卻直接回原 primeText）
	for (const { primeText, matchText, formattedPrimeText, formattedMatchText } of fullMatch) {
		if (formattedMatchText.includes(answer)) {
			if (trace) {
				trace.fullMatch = { hitBy: 'matchText', primeText, matchedText: answer, relatedAnswers: __relatedAnswers(primeText, matchText) }
			}
			return __applyRules(formattedPrimeText, partialMatch, trace?.partialMatch)
		}
	}

	// 直接輸入 primeText 不會改寫，但仍屬於該群組；只回報給 explain()，不影響結果
	if (trace) {
		const group = fullMatch.find(({ formattedPrimeText }) => formattedPrimeText === answer)
		if (group) {
			trace.fullMatch = { hitBy: 'primeText', primeText: group.primeText, matchedText: answer, relatedAnswers: __relatedAnswers(group.primeText, group.matchText) }
		}
	}

	// 還原目標是 variantMatch 之後的字串：否則 '稀有氣體' 經 variantMatch 變成 fullMatch
	// primeText '惰性氣體' 後，會被當成 partialMatch 撞上而還原回 '稀有氣體'
	const answerTemp = answer
	answer = __applyRules(answer, partialMatch, trace?.partialMatch)
	// partialMatch 改寫後恰好撞上某個 fullMatch 的 primeText 時還原，避免無關字串被
	// 拉進該群組
	if (answer !== answerTemp && fullMatch.some(({ formattedPrimeText }) => answer === formattedPrimeText)) {
		trace?.partialMatch.forEach(hit => { hit.reverted = true })
		return answerTemp
	}

	return answer
}

// 「1980s」「1980's」「1980S」→「1980年代」。只收四位數且結尾為 0，避免把 10s（10 秒）轉掉；
// 左側要有邊界，'12340s' 不會被切成 '1' + '2340年代'。不用 lookbehind：iOS 15 不支援
const yearFormatter = function (answer) {
	return answer.replace(/(^|\D)(\d{3}0)['’]?[sS](?![A-Za-z])/g, '$1$2年代')
}

const __CJK = /[㐀-䶿一-鿿]/
// 間隔號「.」「·」「‧」「・」統一成「·」（切．格瓦拉＝切·格瓦拉；「．」已由 fullwidth 轉成
// 「.」）。只在兩側都是漢字，或一側漢字一側拉丁字母時轉換：兩側是數字（3·5、3.5，含 \cdot
// 線性化結果）、注音、或都是拉丁字母（U.S.A、N·m）時不動，避免與小數點、乘號混淆
const interpunctFormatter = function (answer) {
	return answer.replace(/[.·‧・]/g, (match, offset, wholeStr) => {
		const before = wholeStr[offset - 1] || ''
		const after = wholeStr[offset + 1] || ''
		const cjkBefore = __CJK.test(before)
		const cjkAfter = __CJK.test(after)
		const isInterpunct = (cjkBefore && (cjkAfter || __LATIN_LETTER.test(after))) || (cjkAfter && __LATIN_LETTER.test(before))
		return isInterpunct ? '·' : match
	})
}

// 排序題的代號之間有沒有箭頭都算對（乙甲丁＝乙→甲→丁）。只在整串都是「單一字元代號 +
// 箭頭」時才刪：多字元代號刪掉箭頭會失去分隔（12→3 與 1→23），化學式（H2→O2）也不動。
// 頭尾的 $ 是 latex 線性化留下的，一併刪掉
const __SORTING_SEQUENCE = /^\$?[甲乙丙丁戊己庚辛壬癸A-Z0-9](?:(?:→|⟶|->)[甲乙丙丁戊己庚辛壬癸A-Z0-9])+\$?$/
const arrowFormatter = function (answer) {
	return __SORTING_SEQUENCE.test(answer) ? answer.replace(/→|⟶|->|\$/g, '') : answer
}

const latexFormatter = function (answer) {
	return latex.linearize(answer)
}

const removeTailPeriodFormatter = function (answer) {
	return answer.replace(/^(.+)。$/, '$1')
}

const numberFormatter = function (answer) {
	return answer.replace(/(\d?)[,，‚](\d?)/g, "$1$2")
}

const phoneticFormatter = function (answer) {
	let result = answer
	// try {
	//  // IOS 15 不支援此語法
	//  result = result
	// 	.replace(/(?<!˙[ㄅ-ㄩ一丫]|˙[ㄅ-ㄩ一丫][ㄅ-ㄩ一丫]|˙[ㄅ-ㄩ一丫][ㄅ-ㄩ一丫][ㄅ-ㄩ一丫])ˉ/g, "")
	// } catch(e) {
    result = result.replace(/ˉ/g, (match, offset, wholeStr) => {
      const before = wholeStr.slice(Math.max(0, offset - 4), offset)

      if (/˙[ㄅ-ㄩ一丫]{1,3}$/.test(before)) {
        return 'ˉ' // 不刪
      }
      return '' // 刪
    })
	// }
	return result
}

const formatters = [
	toStringFormatter,
	fullwidthFormatter,
	// toLowerCaseFormatter,
	// latexFormatter 必須排在 synonymsFormatter 之前：帶 LaTeX 語法的答案要先線性化
	// 成純文字，才有機會符合 fullMatch 的全字相符條件
	latexFormatter,
	caseFormatter,
	// removeSpaceFormatter 排在 synonymsFormatter 之前：字中多打空白（例：'一 戰'）
	// 才比得到同義詞
	removeSpaceFormatter,
	// 以下三個排在 latexFormatter 之後，latex 線性化產生的「·」「⟶」「$」也一併處理。
	// synonymsFormatter 以前啟用的項目都會套用到表上字串（見 __profile），順序可自由調整
	yearFormatter,
	interpunctFormatter,
	arrowFormatter,
	synonymsFormatter,
	removeTailPeriodFormatter,
	// numberFormatter,
	phoneticFormatter
]

// production build 經 terser 壓縮後 Function.name 會被改寫，explain() 回報 steps 時讀這個名稱
const formatterNames = [
	'toStringFormatter',
	'fullwidthFormatter',
	'latexFormatter',
	'caseFormatter',
	'removeSpaceFormatter',
	'yearFormatter',
	'interpunctFormatter',
	'arrowFormatter',
	'synonymsFormatter',
	'removeTailPeriodFormatter',
	'phoneticFormatter'
]
formatters.forEach((formatter, i) => { formatter.formatterName = formatterNames[i] })

/**
 * @description 依 matchTable 的 formatter 開關，回傳該科實際執行的 formatter（順序同 formatters）。
 * 掛在陣列上：既有呼叫端與測試把本模組當成 formatter 陣列使用。
 * @param {object} answerFormatter
 * @param {{ subject?: string }} [options]
 * @returns {Function[]}
 */
formatters.resolve = (answerFormatter, options) => __profile(answerFormatter, options).enabled
// 可由表開關的 formatter 名稱；後端「科目設定」分頁的表頭對照以此為準（見測試）
formatters.switchable = Object.keys(__DEFAULT_SWITCHES)

module.exports = formatters

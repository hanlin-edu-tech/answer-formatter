const config = require('./libs/config')
const api = require('./libs/api')
const allFormatters = require('./libs/formatters')
const latex = require('./libs/latex')
const subjects = require('./libs/subjects')
const defaultTable = require('./data/matchTable.json')

const { MODE, VERSION, API_NAMESPACE, ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT } = config.getConfig()

/**
 * @description 執行雙層非同步語義比對。
 * 1. 完整格式化比對 (基於既有同義詞匹配表)
 * 2. LLM 語義判斷 (針對模糊案例)
 * 僅在 enableLLM() 開啟後才會掛載到 answerFormatter 上。
 * @param {string} answer1
 * @param {string} answer2
 * @param {{ subject?: string }} [options] - 見 format()
 * @returns {Promise<boolean>}
 */
const deepEquals = async function (answer1, answer2, options) {
	if (!answerFormatter.llmEnabled) {
		throw new Error(`${API_NAMESPACE}: deepEquals is unavailable while LLM judgement is disabled.`)
	}

	if (answerFormatter.equals(answer1, answer2, options)) {
		return true
	}

	try {
		return await api.judgeByLLM(answer1, answer2)
	} catch (error) {
		console.error('LLM API call failed:', error)
	}

	return false
}

/**
 * @description 遠端表沒有 variantMatch（欄位不存在或為空陣列）時沿用內建表的。
 * variantMatch 分頁尚未建立時 scripts job 產出空陣列，直接採用會讓內建規則失效。
 * @param {object} remoteTable
 * @returns {object}
 */
const withDefaultVariantMatch = function (remoteTable) {
	if (remoteTable.variantMatch?.length) return remoteTable
	return { ...remoteTable, variantMatch: defaultTable.variantMatch }
}

// options.subject 可傳總庫科目代碼（見 libs/subjects），進入流程前先轉成設定表的科目名稱
const __withSubject = function (options) {
	if (options?.subject === undefined || options.subject === null) return options
	const subject = subjects.normalize(options.subject)
	return subject === options.subject ? options : { ...options, subject }
}

// 依科目設定跑一遍 formatter（不含答案結構的標準化）
const __runFormatters = function (answer, options) {
	// 開頭空白由 removeSpaceFormatter 依開關決定，這裡只去結尾
	let result = answer.toString().trimEnd()
	const enabled = allFormatters.resolve(answerFormatter, options)
	const switches = allFormatters.switches(answerFormatter, options)
	for (let i = 0; i < enabled.length; i++) {
		result = enabled[i](result, answerFormatter, undefined, options, switches)
	}
	return result
}

// equals() 在兩邊 format() 不同時的結構比對（kb-1005031）：兩邊各自依分隔號拆段（見 formatters.parseStructure）。
// - 各段相同就相等；多個答案順序可互換或有 ± 展開時不分順序
// - 寫不寫分隔號都算對（separatorOptional）：一邊有分隔號、另一邊沒有時，接起來相同就相等。
//   標準答案有分隔號、順序可換、每段都是單一個字的代號（甲乙丙、ABC、①②）時，學生沒寫分隔號就一個字拆一段、
//   不分順序（己丙甲＝甲、丙、己）；其他情況只照原順序接（九州四國＝九州、四國；標準「甲丙己」對學生「丙、甲、己」不算）
// - 比對對象含 ± 時「,」「，」「或」也當分隔號（±3＝3，-3＝-3,3＝3或-3）
const __isSingleChar = value => [...value].length === 1
const __sameValues = (x, y, unordered) => {
	if (x.length !== y.length) return false
	const [a, b] = unordered ? [[...x].sort(), [...y].sort()] : [x, y]
	return a.every((value, i) => value === b[i])
}
const __structuralEquals = function (standard, answer, options) {
	const switches = allFormatters.switches(answerFormatter, options)
	const runFormatters = text => __runFormatters(text, options)
	const plusMinus = switches.mathPlusMinus === true && `${standard}${answer}`.includes('±')
	const s = allFormatters.parseStructure(standard, runFormatters, switches, { plusMinus })
	const a = allFormatters.parseStructure(answer, runFormatters, switches, { plusMinus })
	if (!s || !a) return false
	if (__sameValues(s.values, a.values, s.unordered || a.unordered)) return true
	if (switches.separatorOptional !== true || s.plusMinus || a.plusMinus) return false
	const standardSplit = s.pieces.length > 1 && a.pieces.length === 1
	const answerSplit = a.pieces.length > 1 && s.pieces.length === 1
	if (!standardSplit && !answerSplit) return false
	const [multi, single] = standardSplit ? [s, a] : [a, s]
	const target = single.pieces[0]
	if (standardSplit && switches.answerOrder === true && multi.pieces.every(__isSingleChar)) {
		return [...target].sort().join('') === [...multi.pieces].sort().join('')
	}
	const joined = multi.pieces.join('')
	return joined === target || runFormatters(joined) === target
}

const answerFormatter = {
	mode: MODE,
	version: VERSION,
	matchTable: defaultTable,

	/**
	 * @description LLM 語義判斷開關，預設關閉。
	 * 關閉時不掛載 deepEquals，也不會連向後端代理服務，
	 * 因此部署新版 SDK 不會意外啟用 LLM 判斷路徑。
	 */
	llmEnabled: false,

	/**
	 * @description 執行同步格式化。
	 * 帶 subject 時，只套用勾了該科（或各科都勾）的規則列，並依該科的 formatter 開關決定執行哪些
	 * formatter；未帶或表上沒有該科時套用所有規則列與全科開關。
	 * 最後依各科開關標準化答案結構（多答案順序、±、括號因式，見 formatters.formatStructure），
	 * 不分順序或有 ± 時多個答案會排序後以「、」接成一串。
	 * subject 可傳科目名稱，或總庫科目代碼（例：'J-MA'，多個代碼可用陣列或逗號分隔，取第一個對應得到的）。
	 * @param {string} answer 
	 * @param {{ subject?: string|string[] }} [options]
	 * @returns {string}
	 */
	format(answer, options) {
		options = __withSubject(options)
		const switches = allFormatters.switches(answerFormatter, options)
		const runFormatters = text => __runFormatters(text, options)
		const result = runFormatters(answer)
		return allFormatters.formatStructure(answer, result, runFormatters, options, switches) ?? result
	},

	/**
	 * @description 與 format() 走同一條流程，並回報答案觸發了哪些正規化規則。
	 * variantMatch、partialMatch 依觸發順序列出每條規則；fullMatch 回傳命中群組的所有等價寫法，
	 * reverted 為 true 表示該次改寫因撞上 fullMatch 的 primeText 而被還原。
	 * @param {string} answer
	 * @param {{ subject?: string }} [options] - 見 format()
	 * @returns {{ input: string, subject: string|null, normalized: string, variantMatch: object[], fullMatch: object|null, partialMatch: object[], steps: object[] }}
	 */
	explain(answer, options) {
		options = __withSubject(options)
		const trace = { variantMatch: [], fullMatch: null, partialMatch: [] }
		const steps = []
		// 開頭空白由 removeSpaceFormatter 依開關決定，這裡只去結尾
		let result = answer.toString().trimEnd()
		const enabled = allFormatters.resolve(answerFormatter, options)
		const switches = allFormatters.switches(answerFormatter, options)
		// steps 列出所有 formatter，關閉的標 enabled: false 且不改變答案，方便確認開關是否生效
		for (let i = 0; i < allFormatters.length; i++) {
			const formatter = allFormatters[i]
			const before = result
			const isEnabled = enabled.includes(formatter)
			if (isEnabled) result = formatter(result, answerFormatter, trace, options, switches)
			steps.push({ formatter: formatter.formatterName, enabled: isEnabled, before, after: result })
		}
		// 答案結構的標準化不屬於 formatter，另以 structure 回報（null 表示這次沒有改寫）；normalized 與 format() 一致
		const structured = allFormatters.formatStructure(answer, result, text => __runFormatters(text, options), options, switches)
		const structure = structured === null ? null : { before: result, after: structured }
		// subject 只回報表上有定義的科目，呼叫端可據此確認分科規則是否真的套用
		const subject = allFormatters.subjectOf(answerFormatter, options)
		return { input: answer, subject, normalized: structured ?? result, ...trace, steps, structure }
	},

	/**
	 * @description 回報帶這個 subject 時實際套用的科目（與 explain() 的 subject 相同）。
	 * 總庫科目代碼會先轉成科目名稱；表上沒有該科、或代碼對應不到時回傳 null，套用設定表「預設」欄。
	 * @param {string|string[]} [subject] - 見 format() 的 options.subject
	 * @returns {string|null}
	 */
	subjectOf(subject) {
		return allFormatters.subjectOf(answerFormatter, __withSubject({ subject }))
	},

	/**
	 * @description 把 LaTeX 寫法線性化成純文字，不做同義詞與其他格式化。
	 * 供呼叫端判斷「方程式寫法」與「一般寫法」是否為同一個符號。
	 * @param {string} answer
	 * @returns {string}
	 */
	linearizeLatex(answer) {
		return latex.linearize(answer)
	},

	/**
	 * @description 執行同步格式化比對：兩邊 format() 的結果相同即相等，與 format() 走同一套規則
	 * （含答案結構標準化），不同時再依分隔號規則比對（見 __structuralEquals）。
	 * 「寫不寫分隔號都算對」開著時兩個參數不對稱（標準答案有分隔號時學生的單字代號可以換順序，反過來不行），
	 * 第一個參數要放標準答案。這種相等無法化成同一個 format() 字串，自己比較 format() 結果的使用端不會套用，
	 * 要改呼叫 equals()。規則見 README「多個答案與分隔號」。
	 * @param {string} answer1 - 標準答案
	 * @param {string} answer2 - 要比對的答案（學生作答）
	 * @param {{ subject?: string }} [options] - 見 format()
	 * @returns {boolean}
	 */
	equals(answer1, answer2, options) {
		options = __withSubject(options)
		if (answerFormatter.format(answer1, options) == answerFormatter.format(answer2, options)) return true
		const standard = `${answer1 ?? ''}`
		const answer = `${answer2 ?? ''}`
		// 標準答案在完整答案對答表上的其他寫法也套同一套規則（表上「民族、民權、民生」，學生寫「民族民權民生」）
		const related = answerFormatter.explain(standard, options).fullMatch?.relatedAnswers || []
		return [standard, ...related.filter(text => text !== standard)].some(text => __structuralEquals(text, answer, options))
	},

	/**
	 * @description 啟用或停用 LLM 語義判斷。
	 * 停用時 deepEquals 不會掛載，呼叫端可用 typeof 檢查能力是否存在。
	 * @param {boolean} [enabled=true]
	 * @returns {void}
	 */
	enableLLM(enabled = true) {
		answerFormatter.llmEnabled = enabled
		if (enabled) {
			answerFormatter.deepEquals = deepEquals
		} else {
			delete answerFormatter.deepEquals
		}
	},

	/**
	 * @description 更新同義詞匹配表。
	 * @returns {Promise<void>}
	 */
	async updateMatchTable() {
		const remoteTable = await api.getMatchTable() || await api.getMatchTable({ endpoint: ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT })
		answerFormatter.matchTable = remoteTable ? withDefaultVariantMatch(remoteTable) : defaultTable
		console.log('answer formatter updated match table')
	}
}

if (typeof window !== 'undefined' && window) {
	new Promise(async (resolve) => {
		await answerFormatter.updateMatchTable()
		resolve()
	})
	window[API_NAMESPACE] = answerFormatter
}
if (typeof module !== 'undefined' && module.exports) {
	module.exports = answerFormatter
}

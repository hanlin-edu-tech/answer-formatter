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
// fetcher 只要回應是 JSON 就照回（例如錯誤訊息物件），缺了對答列的不當成表
const isMatchTable = function (table) {
	return Array.isArray(table?.fullMatch) && Array.isArray(table?.partialMatch)
}

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

// 頓號答案改成不帶頓號比對時，最多試幾段的所有排列（6 段＝720 種）；超過只試原順序
const __MAX_PERMUTED_PARTS = 6
const __permutations = function (items) {
	if (items.length <= 1) return [items]
	return items.flatMap((item, i) => __permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]))
}
// 「多個答案順序可互換」開著時，標準答案有頓號、學生沒有，也算相等（kb-1005287）：
// 標準答案依頓號、「或」拆成的各段以任一種順序接起來（每個位置沿用原本的分隔符號）、跑一般 formatter
// （含對答表，例如刪除頓號的列）後，等於學生答案跑一般 formatter 的結果就算相等（標準「甲、乙」等於「甲乙」「乙甲」）。
// 學生答案也有頓號時不套用，避免「甲乙、丙」等於「甲、乙丙」。
// 反過來不成立：標準答案沒有頓號時分不出是「國父」這種不能拆的詞還是多個答案，學生加了頓號就不算相等。
// 這種相等無法化成同一個 format() 字串，只有 equals() 會套用
const __matchesWithoutMarks = function (standard, answer, options) {
	const switches = allFormatters.switches(answerFormatter, options)
	const split = allFormatters.answerOrderParts(standard, options, switches)
	if (!split || allFormatters.answerOrderParts(answer, options, switches)) return false
	const { parts, separators } = split
	const target = __runFormatters(answer, options)
	const orders = parts.length > __MAX_PERMUTED_PARTS ? [parts] : __permutations(parts)
	return orders.some(order => __runFormatters(order.map((part, i) => i ? separators[i - 1] + part : part).join(''), options) === target)
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
	 * 國文、數學最後再標準化答案結構（多答案順序、±、括號因式，見 formatters.formatStructure），
	 * 多個答案會排序後以「、」接成一串。
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
	 * （含國文、數學的答案結構標準化）。
	 * 另外，「多個答案順序可互換」開著的科目，一邊有頓號、另一邊沒有時，去掉頓號接起來相同也算相等（kb-1005287）：
	 * - answer1（標準答案）有頓號、answer2 沒有：各段任意順序接起來相同就相等（標準「甲、乙」等於「甲乙」「乙甲」）
	 * - answer1 沒有頓號、answer2 有：不相等（標準「國父」不等於「國、父」）
	 * 因此這種情況下兩個參數不對稱，第一個參數要放標準答案。這種相等無法化成同一個 format() 字串，
	 * 自己比較 format() 結果的使用端不會套用，要改呼叫 equals()。
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
		return __matchesWithoutMarks(standard, answer, options)
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
	 * @description 更新同義詞匹配表。S3、CloudFront 都抓不到有效的表時保留目前的表（未曾更新過就是內建表），
	 * 使用端定期重抓時，一次網路失敗不會讓判定改用另一份規則。
	 * @returns {Promise<boolean>} 是否換上了遠端表
	 */
	async updateMatchTable() {
		const remoteTable = [await api.getMatchTable()].find(isMatchTable) ||
			[await api.getMatchTable({ endpoint: ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT })].find(isMatchTable)
		if (!remoteTable) {
			console.warn('answer formatter failed to fetch match table, keeping the current one')
			return false
		}
		answerFormatter.matchTable = withDefaultVariantMatch(remoteTable)
		console.log('answer formatter updated match table')
		return true
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

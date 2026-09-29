const config = require('./libs/config')
const api = require('./libs/api')
const allFormatters = require('./libs/formatters')
const latex = require('./libs/latex')
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
	 * 帶 subject 時，該科規則（matchTable.subjects[subject]）接在全科通用規則之前一起套用，
	 * 並依該科設定決定是否分大小寫；未帶或表上沒有該科時只套全科通用規則。
	 * @param {string} answer 
	 * @param {{ subject?: string }} [options]
	 * @returns {string}
	 */
	format(answer, options) {
		let result = answer.toString().trim()
		for (let i = 0; i < allFormatters.length; i++) {
			result = allFormatters[i](result, answerFormatter, undefined, options)
		}
		return result
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
		const trace = { variantMatch: [], fullMatch: null, partialMatch: [] }
		const steps = []
		let result = answer.toString().trim()
		for (let i = 0; i < allFormatters.length; i++) {
			const before = result
			result = allFormatters[i](result, answerFormatter, trace, options)
			steps.push({ formatter: allFormatters[i].formatterName, before, after: result })
		}
		// subject 只回報表上有定義的科目，呼叫端可據此確認分科規則是否真的套用
		const subject = answerFormatter.matchTable?.subjects?.[options?.subject] ? options.subject : null
		return { input: answer, subject, normalized: result, ...trace, steps }
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
	 * @description 執行同步格式化比對。
	 * @param {string} answer1 
	 * @param {string} answer2 
	 * @param {{ subject?: string }} [options] - 見 format()
	 * @returns {boolean}
	 */
	equals(answer1, answer2, options) {
		return answerFormatter.format(answer1, options) == answerFormatter.format(answer2, options)
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
		answerFormatter.matchTable = await api.getMatchTable() || await api.getMatchTable({ endpoint: ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT }) || defaultTable
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

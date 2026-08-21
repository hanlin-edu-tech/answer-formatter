const config = require('./libs/config')
const api = require('./libs/api')
const allFormatters = require('./libs/formatters')
const defaultTable = require('./data/matchTable.json')

const { MODE, VERSION, API_NAMESPACE, ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT } = config.getConfig()

/**
 * @description 執行雙層非同步語義比對。
 * 1. 完整格式化比對 (基於既有同義詞匹配表)
 * 2. LLM 語義判斷 (針對模糊案例)
 * 僅在 enableLLM() 開啟後才會掛載到 answerFormatter 上。
 * @param {string} answer1
 * @param {string} answer2
 * @returns {Promise<boolean>}
 */
const deepEquals = async function (answer1, answer2) {
	if (!answerFormatter.llmEnabled) {
		throw new Error(`${API_NAMESPACE}: deepEquals is unavailable while LLM judgement is disabled.`)
	}

	if (answerFormatter.equals(answer1, answer2)) {
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
	 * @param {string} answer 
	 * @returns {string}
	 */
	format(answer) {
		let result = answer.toString().trim()
		for (let i = 0; i < allFormatters.length; i++) {
			result = allFormatters[i](result, answerFormatter)
		}
		return result
	},

	/**
	 * @description 執行同步格式化比對。
	 * @param {string} answer1 
	 * @param {string} answer2 
	 * @returns {boolean}
	 */
	equals(answer1, answer2) {
		return answerFormatter.format(answer1) == answerFormatter.format(answer2)
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

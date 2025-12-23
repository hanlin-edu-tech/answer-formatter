const config = require('./libs/config')
const api = require('./libs/api')
const allFormatters = require('./libs/formatters')
const defaultTable = require('./data/matchTable.json')

const { MODE, VERSION, API_NAMESPACE, ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT } = config.getConfig()

const answerFormatter = {
	mode: MODE,
	version: VERSION,
	matchTable: defaultTable,

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
	 * @description 執行雙層非同步語義比對。
	 * 1. 完整格式化比對 (基於既有同義詞匹配表)
	 * 2. LLM 語義判斷 (針對模糊案例)
	 * @param {string} answer1
	 * @param {string} answer2
	 * @returns {Promise<boolean>}
	 */
	async deepEquals(answer1, answer2) {
		const formattedAnswer1 = this.format(answer1)
		const formattedAnswer2 = this.format(answer2)

		if (formattedAnswer1 === formattedAnswer2) {
			return true
		}

		try {
			return await api.judgeByLLM(answer1, answer2)
		} catch (error) {
			console.error("LLM API call failed:", error)
		}

		return false
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

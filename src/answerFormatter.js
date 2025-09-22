const config = require('./libs/config')
const api = require('./libs/api')
const formatters = require('./libs/formatters')
const defaultTable = require('./data/matchTable.json')

const { MODE, VERSION, API_NAMESPACE, ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT } = config.getConfig()

const answerFormatter = {
	mode: MODE,
	version: VERSION,
	matchTable: defaultTable,
	format(answer) {
		let result = answer
		for (let i = 0; i < formatters.length; i++) {
			result = formatters[i](result, answerFormatter)
		}
		return result
	},
	equals(answer1, answer2) {
		return answerFormatter.format(answer1) == answerFormatter.format(answer2)
	},
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

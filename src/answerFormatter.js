const config = require('./libs/config')
const api = require('./libs/api')
const formatters = require('./libs/formatters')
const defaultTable = require('./data/matchTable.json')

const { MODE, VERSION, API_NAMESPACE } = config.getConfig()

const buildAnswerFormatter = () => {
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
		}
	}

	new Promise(async (resolve) => {
		answerFormatter.matchTable = await api.getMatchTable() || defaultTable
		resolve()
	})

	if (typeof window !== 'undefined' && window) {
		window[API_NAMESPACE] = answerFormatter
	}

	return answerFormatter
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = buildAnswerFormatter()
}
if (typeof window !== 'undefined' && window) {
	buildAnswerFormatter()
}

const config = require('./libs/config')
const api = require('./libs/api')
const formatters = require('./libs/formatters')

const { MODE, VERSION, API_NAMESPACE } = config.getConfig()

const buildAnswerFormatter = async () => {
	const answerFormatter = {
		mode: MODE,
		version: VERSION,
		matchTable: await api.getMatchTable() || {},
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

	if (typeof window !== 'undefined' && window) {
		window[API_NAMESPACE] = answerFormatter
		const event = new Event('answerFormatterReady')
		window.dispatchEvent(event)
	}

	return answerFormatter
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = buildAnswerFormatter
}
buildAnswerFormatter()

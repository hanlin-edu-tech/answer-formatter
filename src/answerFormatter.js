const config = require('./libs/config')
const formatters = require('./libs/formatters')

const { MODE, VERSION, API_NAMESPACE } = config.getConfig()

const answerFormatter = {
	mode: MODE,
	version: VERSION,
	format(answer) {
		let result = answer
		for (let i = 0; i < formatters.length; i++) {
			result = formatters[i](result)
		}
		return result
	},
	equals(answer1, answer2) {
		return answerFormatter.format(answer1) == answerFormatter.format(answer2)
	}
}

module ? module.exports = answerFormatter : null
window ? window[API_NAMESPACE] = answerFormatter : null

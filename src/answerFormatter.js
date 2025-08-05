const config = require('./libs/config')
const api = require('./libs/api')
const formatters = require('./libs/formatters')

const { MODE, VERSION, API_NAMESPACE } = config.getConfig()

const main = async () => {
	const matchTable = await api.getMatchTable()
	const answerFormatter = {
		mode: MODE,
		version: VERSION,
		matchTable,
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

	module ? module.exports = answerFormatter : null
	window ? window[API_NAMESPACE] = answerFormatter : null
}

main()

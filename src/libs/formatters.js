const stringFormUtils =  require('string-form-utils')

const toStringFormatter = function (answer) {
	return answer.toString()
}

const fullwidthFormatter = function (answer) {
	return stringFormUtils.transformToHalfwidth(answer)
}

const toLowerCaseFormatter = function (answer) {
	return answer.toLowerCase()
}

const symbolFormatter = function (answer) {
	return answer
		.replace(/,|，/g, "‚")
		.replace(/’/g, "'")
		.replace(/＝/g, "=")
		.replace(/《|》/g, "")
		.replace(/〈|〉/g, "")
}

const __matchTextFormatter = function (matchText = []) {
	return matchText.map(text => {
		text = toLowerCaseFormatter(text)
		text = symbolFormatter(text)
		return text
	})
}
const synonymsFormatter = function (answer, answerFormatter) {
	const { fullMatch = [], partialMatch = [] } = answerFormatter?.matchTable || {}
	for (const { primeText = '', matchText = [] } of fullMatch) {
		if (__matchTextFormatter(matchText).includes(answer)) {
			return primeText
		}
	}
	for (const { primeText = '', matchText = [] } of partialMatch) {
		const regex = new RegExp(`(${__matchTextFormatter(matchText).join('|')})`, 'g')
		answer = answer.replace(regex, primeText)
	}
	return answer
}

const latexFormatter = function (answer) {
	return answer
		.replace(/\\ /g, '')
		.replace(/\{ *\}/g, '')
		.replace(/[\u2080-\u2089]/g, function (target) {
			const code = target.charCodeAt(0)
			return '_' + String.fromCharCode(code - 8272)
		})
}

const removeSpaceFormatter = function (answer) {
	return answer.replace(/[\u0000-\u0020\u007F\s]/g, '')
}

const removeTailPeriodFormatter = function (answer) {
	return answer.replace(/^(.+)。$/, '$1')
}

const numberFormatter = function (answer) {
	return answer.replace(/(\d?)[,，‚](\d?)/g, "$1$2")
}

const phoneticFormatter = function (answer) {
	let result = answer
		.replace(/ㄧ/g, '一')
		.replace(/ㄚ/g, '丫')
		.replace(/•/g, '˙')
	// try {

	//  // IOS 15 不支援此語法
	//  result = result
	// 	.replace(/(?<!˙[ㄅ-ㄩ一丫]|˙[ㄅ-ㄩ一丫][ㄅ-ㄩ一丫]|˙[ㄅ-ㄩ一丫][ㄅ-ㄩ一丫][ㄅ-ㄩ一丫])ˉ/g, "")
	// } catch(e) {
    result = result.replace(/ˉ/g, (match, offset, wholeStr) => {
      const before = wholeStr.slice(Math.max(0, offset - 4), offset)

      if (/˙[ㄅ-ㄩ一丫]{1,3}$/.test(before)) {
        return 'ˉ' // 不刪
      }
      return '' // 刪
    })
	// }
	return result
}

const booleanFormatter = function (answer) {
	switch (answer) {
		case "◯":
		case "○":
		case "O":
		case "o":
		// case "0":
		case "ˇ":
		case "true":
			return "true"
		case "╳":
		case "X":
		case "x":
		case "✕":
		case "false":
			return "false"
		default:
			return answer
	}
}

const formatters = [
	toStringFormatter,
	fullwidthFormatter,
	toLowerCaseFormatter,
	symbolFormatter,
	synonymsFormatter,
	latexFormatter,
	removeSpaceFormatter,
	removeTailPeriodFormatter,
	numberFormatter,
	phoneticFormatter,
	booleanFormatter
]

module.exports = formatters

const stringFormUtils =  require('string-form-utils')

const toStringFormatter = function (answer) {
	return answer.toString()
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

const toLowerCaseFormatter = function (answer) {
	return answer.toLowerCase()
}

const fullwidthFormatter = function (answer) {
	return stringFormUtils.transformToHalfwidth(answer)
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

const synonymsFullFormatter = function (answer, answerFormatter) {
	const { fullMatch = [] } = answerFormatter?.matchTable || {}
	for (const { primeText = '', matchText = [] } of fullMatch) {
		if (matchText.includes(answer)) {
			return primeText
		}
	}
	return answer
}

const synonymsPartialFormatter = function (answer, answerFormatter) {
	const { partialMatch = [] } = answerFormatter?.matchTable || {}
	for (const { primeText = '', matchText = [] } of partialMatch) {
		const regex = new RegExp(`(${matchText.join('|')})`, 'g')
		answer = answer.replace(regex, primeText)
	}
	return answer
}

const symbolFormatter = function (answer) {
	return answer
		.replace(/,|，/g, "‚")
		.replace(/’/g, "'")
		.replace(/＝/g, "=")
		.replace(/《|》/g, "")
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
		// case "X":
		// case "x":
		case "✕":
		case "false":
			return "false"
		default:
			return answer
	}
}

const formatters = [
	toStringFormatter,
	latexFormatter,
	toLowerCaseFormatter,
	fullwidthFormatter,
	removeSpaceFormatter,
	removeTailPeriodFormatter,
	numberFormatter,
	phoneticFormatter,
	synonymsFullFormatter,
	synonymsPartialFormatter,
	symbolFormatter,
	booleanFormatter
]

module.exports = formatters

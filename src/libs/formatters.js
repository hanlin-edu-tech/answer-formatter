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

const __matchTextFormatter = function (matchText = []) {
	return matchText.map(text => {
		// text = toLowerCaseFormatter(text)
		return text
	}).sort((a, b) => b.length - a.length)
}
const synonymsFormatter = function (answer, answerFormatter) {
	const { fullMatch = [], partialMatch = [] } = answerFormatter?.matchTable || {}

	for (const { primeText = '', matchText = [] } of fullMatch) {
		if (__matchTextFormatter(matchText).includes(answer)) {
			return primeText
		}
	}

	const answerTemp = answer
	for (const { primeText = '', matchText = [] } of partialMatch) {
		if (answer !== primeText) {
			for (const formattedText of __matchTextFormatter(matchText)) {
				if (answer.includes(formattedText)) {
					answer = answer.replaceAll(formattedText, primeText)
					break
				}
			}
		}
	}
	for (const { primeText = '' } of fullMatch) {
		if (answer === primeText) {
			return answerTemp
		}
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
	return answer.replace(/[\u0000-\u0020\u007F\u200B\s]/g, '')
}

const removeTailPeriodFormatter = function (answer) {
	return answer.replace(/^(.+)。$/, '$1')
}

const numberFormatter = function (answer) {
	return answer.replace(/(\d?)[,，‚](\d?)/g, "$1$2")
}

const phoneticFormatter = function (answer) {
	let result = answer
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

const formatters = [
	toStringFormatter,
	fullwidthFormatter,
	// toLowerCaseFormatter,
	synonymsFormatter,
	latexFormatter,
	removeSpaceFormatter,
	removeTailPeriodFormatter,
	// numberFormatter,
	phoneticFormatter
]

module.exports = formatters

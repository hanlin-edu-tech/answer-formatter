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

// 空白一律刪除（規則：空格有無都可以過關）
const removeSpaceFormatter = function (answer) {
	return answer.replace(/[\u0000-\u0020\u007F\u200B\s]/g, '')
}

// 答案進 synonymsFormatter 前已去空白，表上的寫法也要同樣去空白才比得到
// （例：'Freeway No. 5' → 'FreewayNo.5'）
const __matchTextFormatter = function (matchText = []) {
	return matchText.map(text => {
		// text = toLowerCaseFormatter(text)
		text = removeSpaceFormatter(text)
		return text
	}).sort((a, b) => b.length - a.length)
}
// fullMatch 的 primeText 是表上的原始字串，未經排在 synonymsFormatter 之前的
// formatter；直接回傳會與「使用者輸入 primeText」那條路徑分岔（例：全形括號）。
// 此清單須與 formatters 陣列中 synonymsFormatter 以前的項目一致。
const __formatPrimeText = function (primeText) {
	return removeSpaceFormatter(fullwidthFormatter(toStringFormatter(primeText)))
}
const __applyPartialMatch = function (answer, partialMatch = []) {
	for (const { primeText = '', matchText = [] } of partialMatch) {
		// 替換進去的 primeText 也要去空白，否則會在已去空白的答案中留下空白
		const formattedPrimeText = __formatPrimeText(primeText)
		if (answer !== formattedPrimeText) {
			for (const formattedText of __matchTextFormatter(matchText)) {
				if (answer.includes(formattedText)) {
					answer = answer.replaceAll(formattedText, formattedPrimeText)
					break
				}
			}
		}
	}
	return answer
}
const synonymsFormatter = function (answer, answerFormatter) {
	const { fullMatch = [], partialMatch = [] } = answerFormatter?.matchTable || {}

	// fullMatch 命中後 primeText 仍要過 partialMatch：否則同群組的兩種寫法會走到
	// 不同結果（primeText 本身會被 partialMatch 改寫，matchText 卻直接回原 primeText）
	for (const { primeText = '', matchText = [] } of fullMatch) {
		if (__matchTextFormatter(matchText).includes(answer)) {
			return __applyPartialMatch(__formatPrimeText(primeText), partialMatch)
		}
	}

	const answerTemp = answer
	answer = __applyPartialMatch(answer, partialMatch)
	// partialMatch 改寫後恰好撞上某個 fullMatch 的 primeText 時還原，避免無關字串被
	// 拉進該群組
	for (const { primeText = '' } of fullMatch) {
		if (answer === __formatPrimeText(primeText)) {
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
	// latexFormatter 必須排在 removeSpaceFormatter 之前：'\ ' 要整組清掉，先去空白會留下 '\'；
	// 也排在 synonymsFormatter 之前，'\ x' 清完才符合 fullMatch 的全字相符條件
	latexFormatter,
	// removeSpaceFormatter 排在 synonymsFormatter 之前：字中多打空白（例：'一 戰'、標準答案
	// '國道 3 號'）才比得到同義詞；表上的寫法由 __matchTextFormatter / __formatPrimeText 一併去空白
	removeSpaceFormatter,
	synonymsFormatter,
	removeTailPeriodFormatter,
	// numberFormatter,
	phoneticFormatter
]

module.exports = formatters

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
		// \overline{X} -> X (\u7dda\u6bb5\u8a18\u865f)\uff0c\u8207\u6a19\u6e96\u7b54\u6848 X \u8996\u70ba\u7b49\u50f9
		.replace(/\\overline\{([^}]*)\}/g, '$1')
		// \u5e36\u5206\u6578 -> \u5047\u5206\u6578\uff1aN\frac{a}{b} \u8f49\u6210 \frac{Nb+a}{b}
		//   "6\frac{2}{3}"   -> "\frac{20}{3}"
		//   "-4\frac{7}{24}" -> "-\frac{103}{24}"
		// \u53ea\u8655\u7406\u6574\u6578 N\uff08\u907f\u514d\u7834\u58de\u5d4c\u5957 \frac\uff09\uff0cdenominator=0 \u4fdd\u7559\u539f\u6a23\u3002
		.replace(/(-?)(\d+)\\frac\{(\d+)\}\{(\d+)\}/g, (m, sign, whole, num, den) => {
			const w = parseInt(whole, 10)
			const n = parseInt(num, 10)
			const d = parseInt(den, 10)
			if (!Number.isFinite(d) || d === 0) return m
			return `${sign}\\frac{${w * d + n}}{${d}}`
		})
		.replace(/\\ /g, '')
		.replace(/\{ *\}/g, '')
		.replace(/[\u2080-\u2089]/g, function (target) {
			const code = target.charCodeAt(0)
			return '_' + String.fromCharCode(code - 8272)
		})
		// \u89d2\u8a18\u865f\u525d\u9664\uff08\u8207 \overline \u540c\u7406\uff1a\u8207\u55ae\u7d14\u7684\u9ede/\u5b57\u6bcd\u8a18\u865f\u8996\u70ba\u7b49\u50f9\uff09
		.replace(/\u2220/g, '')
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

// 剝除答案開頭的「題組標記」：圈圈數字/字母（①②③…⑱…）後接空白。
//   "④ B"  -> "B"        （標準答案帶題組編號，學生只寫 B 仍視為等價）
// 只在「標記 + 空白 + 後續內容」時剝除，避免把答案本身就是圈圈符號的情況清空。
const leadingMarkerFormatter = function (answer) {
	return answer.replace(/^[①-⓿]+\s+(?=\S)/, '')
}

// 數值表示正規化：
//   1. 全形/半形負號、「負」字 -> 標準負號 '-'（僅在後接數字時，避免動到「勝負」「負責」）
//   2. 阿拉伯數字 + 中文量級（萬/億/兆）-> 展開成純阿拉伯數字
//        "10 兆" -> "10000000000000"
//      只處理「數字 + 單一量級字」的 token；複合（如 1億2000萬）不完整支援，
//      但只會落回不匹配（FN），不會造成誤判（FP）。用 BigInt 避免浮點誤差。
const MAGNITUDE_ZEROS = { '萬': 4n, '億': 8n, '兆': 12n }
const numberRepresentationFormatter = function (answer) {
	let result = answer.replace(/負(?=\d)/g, '-')
	result = result.replace(/(\d+)\s*([萬億兆])/g, (match, digits, unit) => {
		try {
			return (BigInt(digits) * (10n ** MAGNITUDE_ZEROS[unit])).toString()
		} catch (e) {
			return match
		}
	})
	return result
}

const formatters = [
	toStringFormatter,
	fullwidthFormatter,
	// toLowerCaseFormatter,
	leadingMarkerFormatter,
	numberRepresentationFormatter,
	synonymsFormatter,
	latexFormatter,
	removeSpaceFormatter,
	removeTailPeriodFormatter,
	// numberFormatter,
	phoneticFormatter
]

module.exports = formatters

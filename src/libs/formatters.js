const stringFormUtils =  require('string-form-utils')
const latex = require('./latex.js')

const toStringFormatter = function (answer) {
	return answer.toString()
}

const fullwidthFormatter = function (answer) {
	return stringFormUtils.transformToHalfwidth(answer)
}

const toLowerCaseFormatter = function (answer) {
	return answer.toLowerCase()
}

const __LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/
// 英文單字間的空白有意義（例：'a part' 與 'apart'），兩側都是英文字母時縮成一個空白；
// 其餘空白一律刪除（中文字間、數字與單位間、標點旁）。
// 不用 lookbehind：iOS 15 不支援
const removeSpaceFormatter = function (answer) {
	return answer.replace(/[\u0000-\u0020\u007F\u200B\s]+/g, (match, offset, wholeStr) => {
		const before = wholeStr[offset - 1] || ''
		const after = wholeStr[offset + match.length] || ''
		return __LATIN_LETTER.test(before) && __LATIN_LETTER.test(after) ? ' ' : ''
	})
}

// 答案進 synonymsFormatter 前已整理空白，表上的寫法也要同樣整理才比得到
// （例：'Freeway No. 5' → 'Freeway No.5'）
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
// 同一群組內所有被視為等價的寫法；primeText 為空字串的規則（刪除符號）不列入
const __relatedAnswers = function (primeText, matchText = []) {
	return [primeText, ...matchText].filter(text => text !== '')
}
const __applyPartialMatch = function (answer, partialMatch = [], hits) {
	for (const { primeText = '', matchText = [] } of partialMatch) {
		// 替換進去的 primeText 也要整理空白，否則會在已整理的答案中留下多餘空白
		const formattedPrimeText = __formatPrimeText(primeText)
		if (answer !== formattedPrimeText) {
			for (const formattedText of __matchTextFormatter(matchText)) {
				if (answer.includes(formattedText)) {
					const replaced = answer.replaceAll(formattedText, formattedPrimeText)
					hits?.push({
						primeText,
						matchedText: formattedText,
						before: answer,
						after: replaced,
						relatedAnswers: __relatedAnswers(primeText, matchText),
						reverted: false
					})
					answer = replaced
					break
				}
			}
		}
	}
	return answer
}
/**
 * @param {string} answer
 * @param {object} answerFormatter
 * @param {object} [trace] - 由 explain() 傳入，收集命中的規則；format() 不傳，行為不變。
 */
const synonymsFormatter = function (answer, answerFormatter, trace) {
	const { fullMatch = [], partialMatch = [] } = answerFormatter?.matchTable || {}

	// fullMatch 命中後 primeText 仍要過 partialMatch：否則同群組的兩種寫法會走到
	// 不同結果（primeText 本身會被 partialMatch 改寫，matchText 卻直接回原 primeText）
	for (const { primeText = '', matchText = [] } of fullMatch) {
		if (__matchTextFormatter(matchText).includes(answer)) {
			if (trace) {
				trace.fullMatch = { hitBy: 'matchText', primeText, matchedText: answer, relatedAnswers: __relatedAnswers(primeText, matchText) }
			}
			return __applyPartialMatch(__formatPrimeText(primeText), partialMatch, trace?.partialMatch)
		}
	}

	// 直接輸入 primeText 不會改寫，但仍屬於該群組；只回報給 explain()，不影響結果
	if (trace) {
		const group = fullMatch.find(({ primeText = '' }) => __formatPrimeText(primeText) === answer)
		if (group) {
			trace.fullMatch = { hitBy: 'primeText', primeText: group.primeText, matchedText: answer, relatedAnswers: __relatedAnswers(group.primeText, group.matchText) }
		}
	}

	const answerTemp = answer
	answer = __applyPartialMatch(answer, partialMatch, trace?.partialMatch)
	// partialMatch 改寫後恰好撞上某個 fullMatch 的 primeText 時還原，避免無關字串被
	// 拉進該群組
	for (const { primeText = '' } of fullMatch) {
		if (answer === __formatPrimeText(primeText)) {
			if (trace && answer !== answerTemp) {
				trace.partialMatch.forEach(hit => { hit.reverted = true })
			}
			return answerTemp
		}
	}

	return answer
}

const latexFormatter = function (answer) {
	return latex.linearize(answer)
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
	// latexFormatter 必須排在 synonymsFormatter 之前：帶 LaTeX 語法的答案要先線性化
	// 成純文字，才有機會符合 fullMatch 的全字相符條件
	latexFormatter,
	// removeSpaceFormatter 排在 synonymsFormatter 之前：字中多打空白（例：'一 戰'）
	// 才比得到同義詞；表上的寫法由 __matchTextFormatter / __formatPrimeText 一併整理空白
	removeSpaceFormatter,
	synonymsFormatter,
	removeTailPeriodFormatter,
	// numberFormatter,
	phoneticFormatter
]

// production build 經 terser 壓縮後 Function.name 會被改寫，explain() 回報 steps 時讀這個名稱
const formatterNames = [
	'toStringFormatter',
	'fullwidthFormatter',
	'latexFormatter',
	'removeSpaceFormatter',
	'synonymsFormatter',
	'removeTailPeriodFormatter',
	'phoneticFormatter'
]
formatters.forEach((formatter, i) => { formatter.formatterName = formatterNames[i] })

module.exports = formatters

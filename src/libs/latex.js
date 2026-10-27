const UNICODE_SUBSCRIPT_OFFSET = 8272

// 小鍵盤的方程式鍵送出的是 LaTeX，答案庫存的是純文字；兩者要先線性化成同一種寫法
// 才有機會相等（\frac {1}{2} -> 1/2、x^{2} -> x^2、\times -> ×）。
// 對映依據是小鍵盤符號表 keyboardCodes.json 裡成對的方程式鍵與一般鍵。
const LATEX_COMMAND_MAP = {
	times: '×', div: '÷', pm: '±', ne: '≠', neq: '≠', gt: '>', lt: '<',
	ge: '≥', geq: '≥', le: '≤', leq: '≤', cong: '≅', sim: '∼', approx: '≈',
	equiv: '≡', propto: '∝', angle: '∠', perp: '⊥', parallel: '∥',
	therefor: '∴', therefore: '∴', cuz: '∵', because: '∵', infty: '∞',
	cdot: '·', ell: 'ℓ', degree: '°',
	rightarrow: '→', leftarrow: '←', leftrightarrow: '↔',
	longrightarrow: '→', longleftarrow: '←', longleftrightarrow: '↔',
	uparrow: '↑', downarrow: '↓', diverges: '↑', converges: '↓',
	nearrow: '↗', searrow: '↘', swarrow: '↙', nwarrow: '↖',
	odot: '⊙', otimes: '⊗', cup: '∪', cap: '∩', triangle: '△', cdots: '⋯',
	alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsiv: 'ε', varepsilon: 'ε',
	eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', pi: 'π', rho: 'ρ', sigma: 'σ',
	tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Psi: 'Ψ', Omega: 'Ω',
	sum: 'Σ', prod: 'Π', int: '∫'
}
// 只改字體或加框的命令：不影響答案意義，線性化時只留內容
const LATEX_WRAPPER_COMMANDS = ['text', 'textrm', 'mathrm', 'mathbf', 'boxed']
// 上下劃線、箭頭這類標記會改變答案意義（線段 AB 不等於 AB、向量不等於純量），不能丟掉。
// 改成在每個字元後加上對應的 unicode 組合符號：寫法差異（\vec 與 \overrightarrow、
// MathQuill 補的空白）線性化後仍相同，但與沒有標記的答案不相等。
// 不保留命令名稱，是因為同義詞表的部分比對會改寫字母（o、x），命令名稱會被咬壞
const LATEX_DECORATION_COMMANDS = {
	overline: '\u0305', bar: '\u0305',
	underline: '\u0332',
	overrightarrow: '\u20D7', vec: '\u20D7',
	overleftarrow: '\u20D6',
	hat: '\u0302'
}
// 有反斜線或 ^{ _{ 才算 LaTeX 寫法；純文字裡的大括號是集合符號（{1,2}），不能當分組拆掉
const LATEX_SYNTAX_REGEX = /\\|[\^_]\{/
const UNICODE_SUPERSCRIPT_MAP = {
	'⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
	'⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9'
}

// answer[start] 必須是 '{'，回傳配對右括號之前的內容；找不到配對時回傳 null
const __readBraceGroup = function (answer, start) {
	if (answer[start] !== '{') return null

	let depth = 0
	for (let i = start; i < answer.length; i++) {
		if (answer[i] === '{') depth++
		if (answer[i] === '}') {
			depth--
			if (depth === 0) return { content: answer.slice(start + 1, i), end: i + 1 }
		}
	}
	return null
}
// LaTeX 命令與運算元之間的空白只是分隔符（符號表的鍵就寫成 '\frac { }{ }'）
const __skipSpaces = function (answer, index) {
	while (answer[index] === ' ') index++

	return index
}
// 讀下一個運算元：帶大括號時取整組，否則取單一字元（LaTeX 的 \frac12 寫法）
const __readOperand = function (answer, start) {
	const index = __skipSpaces(answer, start)
	const group = __readBraceGroup(answer, index)
	if (group) return { content: group.content, end: group.end }
	if (index < answer.length) return { content: answer[index], end: index + 1 }

	return { content: '', end: index }
}

// 攤平後大括號消失，根號、次方、分母蓋到哪裡就看不出來（\sqrt{6+\sqrt{2}} 與 \sqrt{6}+\sqrt{2}
// 都變成 √6+√2）。運算元不是單一個數或單一字元時改用小括號標出範圍；空的運算元（MathQuill
// 的空槽）也標成「()」，不會和填了內容的寫法撞在一起（2\sqrt{ }7 與 2\sqrt{7}）
const __ATOM = /^(\d+(\.\d+)?|[^\s\d+\-−±∓×÷·/^_√=<>≤≥≠,，、()（）])$/u
// 分母可以多一層根號或次方（1/√2、1/x^2），或是負數（85/-42）：寫成一行時仍只有一種讀法
const __DENOMINATOR_ATOM = /^(\^\d+)?√?(\d+(\.\d+)?|[^\s\d+\-−±∓×÷·/^_√=<>≤≥≠,，、()（）])(\^(\d+|[A-Za-z]))?$/u
// 分子只在有加減、等號、逗號這類比除法鬆的運算時才要括號：5x/3、1/2/3、√6/10 由左到右讀不會錯。
// 開頭的負號不算（-1/17）
const __LOOSE_OPERATOR = /[+\-−±∓=<>≤≥≠,，、]/
const __hasLooseOperator = function (text) {
	let depth = 0
	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (char === '(' || char === '（') depth++
		else if (char === ')' || char === '）') depth--
		else if (depth === 0 && i > 0 && __LOOSE_OPERATOR.test(char)) return true
	}
	return false
}
// 單一個數後面緊接著數字時，攤平後會黏成另一個數（\sqrt{1}4 與 \sqrt{14}、x^{2}3 與 x^{23}），也要括號
const __mergesWithNext = function (text, answer, end) {
	return /\d$/.test(text) && /[\d.]/.test(answer[__skipSpaces(answer, end)] || '')
}
const __scoped = function (text, isAtom, answer, end) {
	text = text.trim()
	return isAtom(text) && !__mergesWithNext(text, answer, end) ? text : `(${text})`
}
const __isAtom = text => __ATOM.test(text)
// 上下標接受負的單一個數（x^-1）
const __isScriptAtom = text => __ATOM.test(text.replace(/^-(?=\d)/, ''))
const __isDenominatorAtom = text => __DENOMINATOR_ATOM.test(text.replace(/^-(?=\d)/, ''))
const __isNumeratorAtom = text => text !== '' && !__hasLooseOperator(text)
// 整數後面直接接分數是帶分數（2\frac{1}{3}），直接攤平成 21/3 會和假分數撞在一起；
// 換算成假分數（7/3），數值相等的帶分數與假分數寫法才會相等。
// 前面的數要是獨立的數，不能是次方、下標或根號裡的數字
const __MIXED_NUMBER_WHOLE = /(^|[^\d.^_√/])(\d+) *$/
const __NUMBER = /^\d+$/
const __linearizeLatex = function (answer) {
	let result = ''
	let index = 0

	while (index < answer.length) {
		const char = answer[index]

		if (char !== '\\') {
			// ^{2} -> ^2、_{2} -> _2：只脫大括號，上下標記號本身保留
			if ((char === '^' || char === '_') && answer[index + 1] === '{') {
				const group = __readBraceGroup(answer, index + 1)
				if (group) {
					result += char + __scoped(__linearizeLatex(group.content), __isScriptAtom, answer, group.end)
					index = group.end
					continue
				}
			}
			// 純分組的大括號沒有語意，攤平即可
			if (char === '{') {
				const group = __readBraceGroup(answer, index)
				if (group) {
					result += __linearizeLatex(group.content)
					index = group.end
					continue
				}
			}
			if (char === '}') {
				index++
				continue
			}
			result += char
			index++
			continue
		}

		const command = /^\\([a-zA-Z]+)/.exec(answer.slice(index))
		if (!command) {
			// '\ ' 是 MathQuill 的空白，其餘 '\%' 這類逸出取其字元
			const escaped = answer[index + 1]
			result += escaped === ' ' || escaped === undefined ? '' : escaped
			index += 2
			continue
		}

		const name = command[1]
		let next = index + command[0].length

		if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
			const numerator = __readOperand(answer, next)
			const denominator = __readOperand(answer, numerator.end)
			const top = __scoped(__linearizeLatex(numerator.content), __isNumeratorAtom, answer, numerator.end)
			const bottom = __scoped(__linearizeLatex(denominator.content), __isDenominatorAtom, answer, denominator.end)
			const whole = __NUMBER.test(top) && __NUMBER.test(bottom) && __MIXED_NUMBER_WHOLE.exec(result)
			const improper = whole && Number(whole[2]) * Number(bottom) + Number(top)
			if (Number.isSafeInteger(improper)) {
				result = result.slice(0, whole.index + whole[1].length) + `${improper}/${bottom}`
			} else {
				result += `${top}/${bottom}`
			}
			index = denominator.end
			continue
		}
		if (name === 'sqrt') {
			// 次方根寫在根號前，與答案庫的 '³√8'（上標轉成 ^3 後）對齊
			let degree = ''
			next = __skipSpaces(answer, next)
			if (answer[next] === '[') {
				const close = answer.indexOf(']', next)
				if (close !== -1) {
					const content = __linearizeLatex(answer.slice(next + 1, close)).trim()
					degree = content ? `^${content}` : ''
					next = close + 1
				}
			}
			const radicand = __readOperand(answer, next)
			result += `${degree}√${__scoped(__linearizeLatex(radicand.content), __isAtom, answer, radicand.end)}`
			index = radicand.end
			continue
		}
		if (LATEX_DECORATION_COMMANDS[name]) {
			const wrapped = __readOperand(answer, next)
			const mark = LATEX_DECORATION_COMMANDS[name]
			result += [...__linearizeLatex(wrapped.content)].map(char => char.trim() ? char + mark : char).join('')
			index = wrapped.end
			continue
		}
		if (LATEX_WRAPPER_COMMANDS.includes(name)) {
			const wrapped = __readOperand(answer, next)
			result += __linearizeLatex(wrapped.content)
			index = wrapped.end
			continue
		}
		// \left( \right] 只是括號大小，括號字元本身留在後面
		if (name === 'left' || name === 'right') {
			index = next
			continue
		}
		if (name === 'f') {
			result += 'f'
			index = next
			continue
		}
		// 未知命令保留名字（\log -> log、\sin -> sin），不讓反斜線污染比對
		result += LATEX_COMMAND_MAP[name] || name
		index = next
	}

	return result
}

const latex = {
	/**
	 * @description 把 LaTeX 寫法線性化成純文字（\\frac {1}{2} -> 1/2、x^{2} -> x^2），
	 * 並把 unicode 上下標轉成 ^ 與 _，讓方程式輸入與答案庫的純文字答案有共通形式。
	 * @param {string} answer
	 * @returns {string}
	 */
	linearize(answer) {
		const text = answer.toString()
		// 純文字只清掉空的大括號（MathQuill 留下的空槽），與線性化前的行為一致
		const linear = LATEX_SYNTAX_REGEX.test(text) ? __linearizeLatex(text) : text.replace(/\{\s*\}/g, '')
		// 長短箭頭在 MathQuill 顯示相同；一般字元也統一，讓舊答案與新鍵盤仍能對上
		return linear
			.replace(/[⟶⟵⟷]/g, arrow => ({ '⟶': '→', '⟵': '←', '⟷': '↔' })[arrow])
			// 上下標字元後面緊接一般數字時，和方程式寫法一樣用括號隔開（log₂8 與 \log_{2}8 都是 log_(2)8）
			.replace(/([₀-₉])(?=\d)/g, function (target) {
				return '_(' + String.fromCharCode(target.charCodeAt(0) - UNICODE_SUBSCRIPT_OFFSET) + ')'
			})
			.replace(/[₀-₉]/g, function (target) {
				return '_' + String.fromCharCode(target.charCodeAt(0) - UNICODE_SUBSCRIPT_OFFSET)
			})
			.replace(/([⁰¹²³⁴-⁹])(?=\d)/g, function (target) {
				return '^(' + UNICODE_SUPERSCRIPT_MAP[target] + ')'
			})
			.replace(/[⁰¹²³⁴-⁹]/g, function (target) {
				return '^' + UNICODE_SUPERSCRIPT_MAP[target]
			})
	}
}

module.exports = latex

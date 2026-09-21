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
	longrightarrow: '⟶', longleftarrow: '⟵', longleftrightarrow: '⟷',
	uparrow: '↑', downarrow: '↓', diverges: '↑', converges: '↓',
	alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsiv: 'ε', varepsilon: 'ε',
	eta: 'η', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ',
	phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω',
	sum: 'Σ', prod: 'Π', int: '∫'
}
// 只有裝飾作用的命令：答案庫寫不出上下標線與箭頭，線性化時只留內容
const LATEX_WRAPPER_COMMANDS = [
	'text', 'textrm', 'mathrm', 'mathbf', 'boxed',
	'overline', 'underline', 'overleftarrow', 'overrightarrow', 'vec', 'bar', 'hat'
]
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
					result += char + __linearizeLatex(group.content)
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
			result += `${__linearizeLatex(numerator.content)}/${__linearizeLatex(denominator.content)}`
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
			result += `${degree}√${__linearizeLatex(radicand.content)}`
			index = radicand.end
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
		return __linearizeLatex(answer.toString())
			.replace(/[₀-₉]/g, function (target) {
				return '_' + String.fromCharCode(target.charCodeAt(0) - UNICODE_SUBSCRIPT_OFFSET)
			})
			.replace(/[⁰¹²³⁴-⁹]/g, function (target) {
				return '^' + UNICODE_SUPERSCRIPT_MAP[target]
			})
	}
}

module.exports = latex

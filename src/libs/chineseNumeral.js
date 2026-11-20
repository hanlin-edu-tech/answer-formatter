// 中文數字轉阿拉伯數字（kb-1005578）。只認「整串都是中文數字」的寫法，含任何其他字（「3心2意」「三十：七」
// 「二十四小時」）一律回傳 null，不轉。認得的寫法：
// - 整數：二十四、二萬七千五百、一千零五、兩千五百、十五、廿、大寫（壹萬貳仟）；省略最後一個單位的口語寫法
//   （兩千五＝2500、一萬五＝15000、三百五＝350）
// - 逐位唸的數字：二二八＝228、二〇二六＝2026（沒有任何單位時）
// - 負數「負」、小數「點」：負二十＝-20、三點一四＝3.14
// - 分數「A分之B」：二分之一＝1/2（與 LaTeX \frac{1}{2} 線性化後的寫法相同）
const __DIGITS = {
	零: 0, 〇: 0,
	// 「ㄧ」是注音，學生常拿來打「一」（對答表也把它換成「一」，但這條排在對答表之前）
	一: 1, 壹: 1, ㄧ: 1,
	二: 2, 貳: 2, 兩: 2,
	三: 3, 參: 3, 叁: 3,
	四: 4, 肆: 4,
	五: 5, 伍: 5,
	六: 6, 陸: 6,
	七: 7, 柒: 7,
	八: 8, 捌: 8,
	九: 9, 玖: 9
}
const __UNITS = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000 }
const __BIG_UNITS = [['億', 100000000], ['萬', 10000]]
const __ABBREVIATIONS = { 廿: '二十' }

// 萬以下的一段（0–9999）。previousUnit：上一段的大單位，用來判斷「一萬五」這類省略寫法
const __parseSection = function (text, previousUnit) {
	if (text === '') return 0
	let total = 0
	let digit = null
	let lastUnit = null
	let zero = false
	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (char in __DIGITS) {
			if (digit !== null) return null
			if (__DIGITS[char] === 0) {
				// 「零」只能夾在數字中間（一千零五），單獨或接在數字後面都不認
				if (lastUnit === null && previousUnit === undefined) return null
				zero = true
				continue
			}
			digit = __DIGITS[char]
			continue
		}
		const unit = __UNITS[char]
		if (!unit || (lastUnit !== null && unit >= lastUnit)) return null
		// 開頭的「十」省略「一」（十五）；其他單位前面一定要有數字
		if (digit === null && !(unit === 10 && i === 0 && previousUnit === undefined)) return null
		total += (digit ?? 1) * unit
		digit = null
		lastUnit = unit
		zero = false
	}
	if (digit !== null) {
		// 省略最後一個單位：兩千五＝2500、三百五＝350；「一千零五」「二十五」的五是個位
		total += !zero && lastUnit >= 100 ? digit * lastUnit / 10 : digit
	}
	return total
}

// 整數部分（含萬、億）
const __parseInteger = function (text) {
	text = text.replace(/[廿]/g, char => __ABBREVIATIONS[char])
	if (text === '') return null
	// 沒有任何單位：逐位唸（二二八、二〇二六）
	if (![...text].some(char => char in __UNITS || __BIG_UNITS.some(([big]) => big === char))) {
		if (![...text].every(char => char in __DIGITS)) return null
		if (text.length > 1 && __DIGITS[text[0]] === 0) return null
		return [...text].map(char => __DIGITS[char]).join('')
	}
	let total = 0
	let rest = text
	let previousUnit
	for (const [big, value] of __BIG_UNITS) {
		const index = rest.indexOf(big)
		if (index === -1) continue
		const head = rest.slice(0, index)
		if (head === '' || rest.indexOf(big, index + 1) !== -1) return null
		const section = __parseSection(head, previousUnit)
		if (section === null || section === 0) return null
		total += section * value
		rest = rest.slice(index + 1)
		previousUnit = value
	}
	// 萬後面省略單位的一位數（一萬五＝15000）以千計
	const tail = previousUnit && rest.length === 1 && rest in __DIGITS && __DIGITS[rest] !== 0
		? __DIGITS[rest] * previousUnit / 10
		: __parseSection(rest, previousUnit)
	if (tail === null) return null
	total += tail
	return Number.isSafeInteger(total) ? String(total) : null
}

// 非負的數（整數或小數）
const __parseUnsigned = function (text) {
	const parts = text.split('點')
	if (parts.length > 2) return null
	const integer = __parseInteger(parts[0])
	if (integer === null) return null
	if (parts.length === 1) return integer
	const decimals = [...parts[1]]
	if (!decimals.length || !decimals.every(char => char in __DIGITS)) return null
	return `${integer}.${decimals.map(char => __DIGITS[char]).join('')}`
}

const __parseSigned = function (text) {
	const negative = text.startsWith('負')
	const value = __parseUnsigned(negative ? text.slice(1) : text)
	return value === null ? null : `${negative ? '-' : ''}${value}`
}

/**
 * @param {string} text
 * @returns {string|null} 阿拉伯數字寫法；不是整串中文數字時回傳 null
 */
const toArabic = function (text) {
	const fraction = text.split('分之')
	if (fraction.length > 2) return null
	if (fraction.length === 2) {
		const negative = fraction[0].startsWith('負')
		const denominator = __parseUnsigned(negative ? fraction[0].slice(1) : fraction[0])
		const numerator = __parseUnsigned(fraction[1])
		if (denominator === null || numerator === null || Number(denominator) === 0) return null
		return `${negative ? '-' : ''}${numerator}/${denominator}`
	}
	return __parseSigned(text)
}

module.exports = { toArabic }

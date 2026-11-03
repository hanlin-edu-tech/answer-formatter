// 是非題的 O／X 寫法。作答頁（question-item-api）與對答服務（ms-check-answer）都用這一份判定，
// 不查對答表：表上的列被停用或改掉時，是非題會整批判錯（kb-1005668），兩邊判法也會不一致（kb-1006189）。
// 寫法取兩邊原本認得的聯集：作答系統把作答 O／X 送成 true／false，題庫標準答案多寫成 ○ ◯ ╳；
// ˇ（U+02C7）是題庫「對的打ˇ，錯的打╳」題的打勾
const TRUE_TEXTS = ['○', '◯', '〇', 'O', 'o', 'ˇ', 'true']
const FALSE_TEXTS = ['╳', 'X', 'x', '✕', '×', 'false']

/**
 * @description 判斷是非題的一個寫法是 O 還是 X；前後空白不計。
 * @param {*} answer
 * @returns {boolean|null} O 為 true、X 為 false，認不得的寫法為 null
 */
const judge = function (answer) {
	const text = `${answer ?? ''}`.trim()
	if (TRUE_TEXTS.includes(text)) return true
	if (FALSE_TEXTS.includes(text)) return false
	return null
}

module.exports = { TRUE_TEXTS, FALSE_TEXTS, judge }

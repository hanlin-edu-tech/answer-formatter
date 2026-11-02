// 總庫題目的科目代碼對應到對答設定表的科目（國英數自社）。對答多用在總庫題目上，呼叫端可直接傳題目的
// 科目代碼，不必各自維護對照表。沒對應到的代碼（生活、健體、藝術、綜合、科技…）不轉換，
// 由 formatters 視為表上沒有的科目，套用設定表「預設」欄
const SUBJECT_CODES = {
	國文: ['E-CH', 'J-PC', 'H-PC'],
	英文: ['E-EN', 'J-EN', 'H-EN'],
	數學: ['E-MA', 'J-MA', 'H-MA'],
	自然: ['E-NA', 'J-NA', 'J-BI', 'J-PY', 'J-EA', 'H-NA', 'H-BI', 'H-PH', 'H-CE', 'H-EA'],
	社會: ['E-SO', 'J-SO', 'J-GE', 'J-HI', 'J-CT', 'H-SO', 'H-GE', 'H-HI', 'H-CS']
}
const SUBJECT_BY_CODE = Object.fromEntries(Object.entries(SUBJECT_CODES).flatMap(([subject, codes]) => codes.map(code => [code, subject])))
// 對答表上的科目代碼（設定表、對答表的英文表頭；matchTable 的 ruleSubjects、subjects 用這組代碼，kb-1006085）
const SUBJECT_KEYS = { 國文: 'PC', 英文: 'EN', 數學: 'MA', 自然: 'NA', 社會: 'SO' }
const SUBJECT_BY_KEY = Object.fromEntries(Object.entries(SUBJECT_KEYS).map(([subject, key]) => [key, subject]))

/**
 * @description 科目名稱對應的對答表科目代碼（例：'數學' → 'MA'）；沒有對應時回傳 undefined
 * @param {string} subject
 * @returns {string|undefined}
 */
const keyOf = function (subject) {
	return SUBJECT_KEYS[subject]
}

/**
 * @description 把 options.subject 轉成設定表的科目名稱。
 * 接受科目名稱（原樣保留）、單一科目代碼（總庫代碼 J-MA，或對答表代碼 MA），或多個代碼（陣列或逗號分隔字串，取第一個對應得到的）。
 * 都對應不到時回傳原值（單一值）或 null（多個代碼），交給 formatters 判定為表上沒有的科目。
 * @param {string|string[]} [subject]
 * @returns {string|null|undefined}
 */
const normalize = function (subject) {
	if (subject === undefined || subject === null) return subject
	const values = Array.isArray(subject) ? subject : `${subject}`.split(',')
	const mapped = values.map(value => `${value}`.trim()).map(value => SUBJECT_BY_CODE[value] || SUBJECT_BY_KEY[value]).find(Boolean)
	if (mapped) return mapped
	return Array.isArray(subject) || values.length > 1 ? null : subject
}

module.exports = { SUBJECT_CODES, SUBJECT_KEYS, keyOf, normalize }

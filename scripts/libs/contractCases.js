const { explainNotEqual } = require('./ruleEffect')

// 使用端送來的固定寫法：表上的列被停用或改掉時，使用端的判分會整批出錯，轉表者從表上看不出來（kb-1005668）。
// 新的使用端依賴對答表某個對應時，在這裡加案例
const CONTRACT_CASES = [
  {
    // 作答系統把是非題作答 2（X）送成 "false"、1（O）送成 "true"（翰教科 ExamService.cs）
    consumer: '作答系統的是非題',
    row: '完整答案對答表「false」那列',
    standards: ['╳', '×', 'X'],
    answer: 'false',
    notEqual: ['○']
  },
  {
    consumer: '作答系統的是非題',
    row: '完整答案對答表「true」那列',
    standards: ['○', '◯', 'O'],
    answer: 'true',
    notEqual: ['╳']
  }
]

/**
 * @description 檢查即將上傳的表是否仍滿足使用端依賴的對應：在不帶科目與表上每個科目下，
 * 使用端送的寫法要等於每個標準答案、且不等於相反的答案（避免把整組改成全部相等）。
 * 不符就讓 job 失敗、不上傳。
 * @param {object} sdk - answerFormatter SDK
 * @param {object} matchTable - 即將上傳的 matchTable.v2.json
 * @param {object[]} cases - 預設為 CONTRACT_CASES
 * @returns {string[]} 不符的案例，一則一個案例與標準答案；同一個原因在多個科目出現時合併
 */
const checkContractCases = (sdk, matchTable = {}, cases = CONTRACT_CASES) => {
  const original = sdk.matchTable
  const scopes = [null, ...(matchTable.ruleSubjects || [])]
  const failed = new Map()
  try {
    sdk.matchTable = matchTable
    for (const { consumer, row, standards, answer, notEqual = [] } of cases) {
      const checks = [
        ...standards.map(standard => ({ standard, expected: true })),
        ...notEqual.map(standard => ({ standard, expected: false }))
      ]
      for (const { standard, expected } of checks) {
        for (const scope of scopes) {
          const options = scope ? { subject: scope } : undefined
          if (sdk.equals(standard, answer, options) === expected) continue
          const reason = expected ? explainNotEqual(sdk, matchTable, answer, standard, options) : ''
          const verdict = expected ? '判定不相等' : '判定相等'
          const key = `${consumer}送「${answer}」，標準答案「${standard}」${verdict}；請檢查${row}有沒有被停用或改掉｜${reason}`
          if (!failed.has(key)) failed.set(key, [])
          failed.get(key).push(scope || '不帶科目')
        }
      }
    }
  } finally {
    sdk.matchTable = original
  }
  return [...failed.entries()].map(([key, scopeList]) => {
    const [summary, reason] = key.split('｜')
    return [`${summary}〔${scopeList.join('、')}〕`, ...(reason ? [reason] : [])].join('\n')
  })
}

module.exports = { CONTRACT_CASES, checkContractCases }

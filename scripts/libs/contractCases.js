const { describeAnswer, explainNotEqual } = require('./ruleEffect')

// 使用端送來的固定寫法：表上的列被停用或改掉時，使用端的判分會整批出錯，轉表者從表上看不出來（kb-1005668）。
// 目前只有 ms-check-answer 的是非題、選擇題（單選、多選、題組子題）拿固定寫法查對答表，判法是不帶科目的
// format() 相等（作答頁這幾種題型直接比字串，不用對答表；填充、選填題依題目內容，不是固定寫法），這裡照同樣判法檢查。
// 新的使用端依賴對答表某個對應時，在這裡加案例
const CONTRACT_CASES = [
  {
    // 作答系統把是非題作答 2（X）送成 "false"、1（O）送成 "true"（翰教科 ExamService.cs），題庫標準答案是 ╳／○
    consumer: 'ms-check-answer 是非題',
    row: '完整答案對答表「false」那列',
    answer: 'false',
    equal: ['╳', '×', 'X'],
    notEqual: ['○']
  },
  {
    consumer: 'ms-check-answer 是非題',
    row: '完整答案對答表「true」那列',
    answer: 'true',
    equal: ['○', '◯', 'O'],
    notEqual: ['╳']
  },
  {
    // 單選、題組子題比對兩邊 format() 後的選項編號；多選要求作答 format() 後原樣等於 "1"…"N"
    consumer: 'ms-check-answer 選擇題的選項編號',
    unchanged: Array.from({ length: 10 }, (_, i) => String(i + 1))
  }
]

/**
 * @description 檢查即將上傳的表是否仍滿足使用端依賴的對應（判法同 ms-check-answer：不帶科目的 format() 相等）：
 * 使用端送的寫法要等於每個標準答案、不等於相反的答案（避免把整組改成全部相等）；選項編號要原樣不變。
 * 不符就讓 job 失敗、不上傳。
 * @param {object} sdk - answerFormatter SDK
 * @param {object} matchTable - 即將上傳的 matchTable.v2.json
 * @param {object[]} cases - 預設為 CONTRACT_CASES
 * @returns {string[]} 不符的案例，一則一個寫法，附上處理過程
 */
const checkContractCases = (sdk, matchTable = {}, cases = CONTRACT_CASES) => {
  const original = sdk.matchTable
  const failures = []
  try {
    sdk.matchTable = matchTable
    for (const { consumer, row, answer, equal = [], notEqual = [], unchanged = [] } of cases) {
      const hint = `請檢查${row}有沒有被停用或改掉`
      for (const standard of equal) {
        if (sdk.format(answer) === sdk.format(standard)) continue
        failures.push([`${consumer}：作答「${answer}」與標準答案「${standard}」判定不相等；${hint}`, explainNotEqual(sdk, matchTable, answer, standard)].filter(Boolean).join('\n'))
      }
      for (const standard of notEqual) {
        if (sdk.format(answer) !== sdk.format(standard)) continue
        failures.push(`${consumer}：作答「${answer}」與標準答案「${standard}」判定相等；請檢查對答表有沒有把兩者換成同一個寫法`)
      }
      for (const value of unchanged) {
        const formatted = sdk.format(value)
        if (formatted === value) continue
        const trace = typeof sdk.explain === 'function' ? `\n選項編號「${value}」\n${describeAnswer(sdk, matchTable, value)}` : ''
        failures.push(`${consumer}：「${value}」被改寫成「${formatted}」，多選題會整題判錯；請檢查有沒有對答列把「${value}」改寫成別的字${trace}`)
      }
    }
  } finally {
    sdk.matchTable = original
  }
  return failures
}

module.exports = { CONTRACT_CASES, checkContractCases }

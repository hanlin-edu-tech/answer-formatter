const { checkContractCases } = require('../scripts/libs/contractCases')
const answerFormatter = require('../src/answerFormatter')

// 線上表與是非題相關的列（kb-1005668 修正後）
const fullMatch = [
  { primeText: 'true', matchText: ['◯', '○', 'O', 'o'] },
  { primeText: 'false', matchText: ['╳', 'X', 'x', '✕', '×'] }
]
const partialMatch = [{ primeText: '×', matchText: ['x', '*', '╳', '✕'] }]

describe('使用端契約案例（kb-1005720）', () => {
  it('是非題的 true／false 列都在、數字沒被改寫時通過', () => {
    expect(checkContractCases(answerFormatter, { fullMatch, partialMatch })).toEqual([])
  })

  it('false 列被停用時，每個 ╳ 寫法各回報一則，附上兩邊的處理過程', () => {
    const failures = checkContractCases(answerFormatter, { fullMatch: fullMatch.slice(0, 1), partialMatch })
    expect(failures).toHaveLength(3)
    expect(failures[0].split('\n')[0]).toBe('ms-check-answer 是非題：作答「false」與標準答案「╳」判定不相等；請檢查完整答案對答表「false」那列有沒有被停用或改掉')
    expect(failures[0]).toContain('學生寫法「false」')
    expect(failures[0]).toContain('標準答案「╳」')
  })

  it('false 列只勾部分科目時仍通過：ms-check-answer 不帶科目，會套用所有列', () => {
    const table = { fullMatch: [fullMatch[0], { ...fullMatch[1], subjects: ['自然'] }], partialMatch, ruleSubjects: ['國文', '自然'] }
    expect(checkContractCases(answerFormatter, table)).toEqual([])
  })

  it('false 被加進 true 那列時回報與 ○ 判定相等', () => {
    const table = { fullMatch: [{ ...fullMatch[0], matchText: [...fullMatch[0].matchText, 'false'] }, fullMatch[1]], partialMatch }
    expect(checkContractCases(answerFormatter, table)).toContain(
      'ms-check-answer 是非題：作答「false」與標準答案「○」判定相等；請檢查對答表有沒有把兩者換成同一個寫法'
    )
  })

  it('改寫數字的列會讓選項編號判錯；只勾某科也會影響', () => {
    const table = { fullMatch, partialMatch: [...partialMatch, { primeText: '一', matchText: ['1'], subjects: ['國文'] }], ruleSubjects: ['國文', '數學'] }
    const failures = checkContractCases(answerFormatter, table)
    expect(failures.map(failure => failure.split('\n')[0])).toEqual([
      'ms-check-answer 選擇題的選項編號：「1」被改寫成「一」，多選題會整題判錯；請檢查有沒有對答列把「1」改寫成別的字',
      'ms-check-answer 選擇題的選項編號：「10」被改寫成「一0」，多選題會整題判錯；請檢查有沒有對答列把「10」改寫成別的字'
    ])
    expect(failures[0]).toContain('部分答案對答表：把「1」換成「一」')
  })

  it('目前內建的預設表通過', () => {
    expect(checkContractCases(answerFormatter, require('../src/data/matchTable.json'))).toEqual([])
  })
})

const { checkContractCases } = require('../scripts/libs/contractCases')
const answerFormatter = require('../src/answerFormatter')

// 線上表與是非題相關的列（kb-1005668 修正後）
const fullMatch = [
  { primeText: 'true', matchText: ['◯', '○', 'O', 'o'] },
  { primeText: 'false', matchText: ['╳', 'X', 'x', '✕', '×'] }
]
const partialMatch = [{ primeText: '×', matchText: ['x', '*', '╳', '✕'] }]

describe('使用端契約案例（kb-1005720）', () => {
  it('是非題的 true／false 列都在時通過', () => {
    expect(checkContractCases(answerFormatter, { fullMatch, partialMatch, ruleSubjects: ['國文', '數學'] })).toEqual([])
  })

  it('false 列被停用時，每個 ╳ 寫法各回報一則，附上兩邊的處理過程', () => {
    const table = { fullMatch: fullMatch.slice(0, 1), partialMatch, ruleSubjects: ['國文'] }
    const failures = checkContractCases(answerFormatter, table)
    expect(failures).toHaveLength(3)
    expect(failures[0].split('\n')[0]).toBe('作答系統的是非題送「false」，標準答案「╳」判定不相等；請檢查完整答案對答表「false」那列有沒有被停用或改掉〔不帶科目、國文〕')
    expect(failures[0]).toContain('學生寫法「false」')
    expect(failures[0]).toContain('標準答案「╳」')
  })

  it('false 被加進 true 那列時回報與 ○ 判定相等', () => {
    const table = { fullMatch: [{ ...fullMatch[0], matchText: [...fullMatch[0].matchText, 'false'] }, fullMatch[1]], partialMatch }
    expect(checkContractCases(answerFormatter, table)).toContain(
      '作答系統的是非題送「false」，標準答案「○」判定相等；請檢查完整答案對答表「false」那列有沒有被停用或改掉〔不帶科目〕'
    )
  })

  it('目前內建的預設表通過', () => {
    expect(checkContractCases(answerFormatter, require('../src/data/matchTable.json'))).toEqual([])
  })
})

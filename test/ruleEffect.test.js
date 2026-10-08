const { checkRuleEffect } = require('../scripts/libs/ruleEffect')
const answerFormatter = require('../src/answerFormatter')

describe('對答表規則生效檢查（列為警告）', () => {
  it('部分對答改寫後撞上完整對答的標準答案而被還原時提出警告', () => {
    // 先前的實例：單獨作答「無煙囪產業」換成「觀光業」後撞上完整對答而還原
    const table = {
      fullMatch: [{ primeText: '觀光業', matchText: ['旅遊業'] }],
      partialMatch: [{ primeText: '觀光業', matchText: ['無煙囪產業'] }]
    }
    expect(checkRuleEffect(answerFormatter, table)).toEqual([
      '部分對答「無煙囪產業」單獨作答時與標準答案「觀光業」判定不相等〔不帶科目〕'
    ])
  })

  it('規則都生效時沒有警告；接續改寫、刪除列都算生效', () => {
    const table = {
      fullMatch: [{ primeText: '盧溝橋事變', matchText: ['七七事變'] }],
      partialMatch: [
        { primeText: '度', matchText: ['°'] },
        { primeText: '°C', matchText: ['℃', '攝氏'] },
        { primeText: '', matchText: ['《', '》'] }
      ]
    }
    expect(checkRuleEffect(answerFormatter, table)).toEqual([])
  })

  it('只勾部分科目的列只在那些科目檢查，同一列多科不生效時合併成一則', () => {
    const table = {
      ruleSubjects: ['國文', '英文', '數學'],
      // Y 改寫成 X 後，X 單獨作答會再被完整對答換成 Z，兩者判不相等
      fullMatch: [{ primeText: 'Z', matchText: ['X'] }],
      partialMatch: [{ primeText: 'X', matchText: ['Y'], subjects: ['英文', '數學'] }]
    }
    // 國文沒勾，不檢查；不帶科目時套用所有列，一併檢查
    expect(checkRuleEffect(answerFormatter, table)).toEqual([
      '部分對答「Y」單獨作答時與標準答案「X」判定不相等〔不帶科目、英文、數學〕'
    ])
  })

  it('檢查完還原 SDK 原本的 matchTable', () => {
    const original = answerFormatter.matchTable
    checkRuleEffect(answerFormatter, { fullMatch: [], partialMatch: [] })
    expect(answerFormatter.matchTable).toBe(original)
  })
})

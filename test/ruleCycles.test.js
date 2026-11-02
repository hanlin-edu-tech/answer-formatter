const { findPartialCycles } = require('../scripts/libs/ruleCycles')

describe('部分對答循環規則檢查（sc-134172）', () => {
  it('互相改寫的規則回報循環，寫出是哪兩列（kb-1005461）', () => {
    const rules = [{ primeText: '劃', matchText: ['畫'] }, { primeText: '計畫', matchText: ['計劃'] }]
    const problems = findPartialCycles(rules, [], [12, 15])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ sheet: 'partialMatch', location: '第 12 列和第 15 列' })
    expect(problems[0].text).toMatch(/^互相改寫（(計畫→計劃→計畫|計劃→計畫→計劃)），請刪掉其中一列。$/)
  })

  it('甲 ← 乙、乙 ← 甲 加在最後兩列時指出這兩列（kb-1005461 驗收 13）', () => {
    const rules = [{ primeText: '臺灣', matchText: ['台灣'] }, { primeText: '甲', matchText: ['乙'] }, { primeText: '乙', matchText: ['甲'] }]
    expect(findPartialCycles(rules, [], [3, 40, 41])).toEqual([
      { sheet: 'partialMatch', location: '第 40 列和第 41 列', text: '互相改寫（甲→乙→甲），請刪掉其中一列。' }
    ])
  })

  it('沒帶列號時不寫位置', () => {
    const rules = [{ primeText: '甲', matchText: ['乙'] }, { primeText: '乙', matchText: ['甲'] }]
    expect(findPartialCycles(rules)).toEqual([{ sheet: 'partialMatch', location: '', text: '有幾列互相改寫（甲→乙→甲），請刪掉其中一列。' }])
  })

  it('會收斂的接續改寫與擴寫規則不算循環', () => {
    const rules = [
      { primeText: '度', matchText: ['°'] },
      { primeText: '°C', matchText: ['℃', '攝氏'] },
      { primeText: '臺東', matchText: ['台東'] },
      { primeText: '台東', matchText: ['台東縣'] },
      { primeText: '中國國民黨', matchText: ['國民黨'] },
      { primeText: '', matchText: ['《', '》'] }
    ]
    expect(findPartialCycles(rules)).toEqual([])
  })

  it('分科列也一起檢查：不帶科目時套用所有列，同一組循環只回報一次', () => {
    const rules = [
      { primeText: 'b', matchText: ['a'], subjects: ['英文'] },
      { primeText: 'a', matchText: ['b'], subjects: ['英文', '數學'] }
    ]
    const problems = findPartialCycles(rules, ['英文', '數學'], [2, 3])
    expect(problems).toHaveLength(1)
    expect(problems[0].location).toBe('第 2 列和第 3 列')
    expect(problems[0].text).toMatch(/^互相改寫/)
  })

  it('沒有分科列時只檢查一次', () => {
    expect(findPartialCycles([{ primeText: '臺灣', matchText: ['台灣'] }], ['英文'])).toEqual([])
  })
})

const { findPartialCycles } = require('../scripts/libs/ruleCycles')

describe('部分對答循環規則檢查（sc-134172）', () => {
  it('互相改寫的規則回報循環', () => {
    const rules = [{ primeText: '劃', matchText: ['畫'] }, { primeText: '計畫', matchText: ['計劃'] }]
    const messages = findPartialCycles(rules)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/計畫 → 計劃 → 計畫|計劃 → 計畫 → 計劃/)
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
    const messages = findPartialCycles(rules, ['英文', '數學'])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/^部分對答規則循環：/)
  })

  it('沒有分科列時只檢查一次', () => {
    expect(findPartialCycles([{ primeText: '臺灣', matchText: ['台灣'] }], ['英文'])).toEqual([])
  })
})

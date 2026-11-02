const { diffMatchTable, changeMessages } = require('../scripts/libs/tableDiff')

const falseRow = { primeText: 'false', matchText: ['╳', 'X', 'x', '✕', '×'] }
const trueRow = { primeText: 'true', matchText: ['◯', '○', 'O', 'o'] }
const published = {
  fullMatch: [trueRow, falseRow],
  partialMatch: [{ primeText: '≧', matchText: ['≥'] }, { primeText: '≧', matchText: ['>='] }]
}

describe('轉檔變動比對（kb-1005721）', () => {
  it('沒有變動時回報沒有變動；只調順序不算變動', () => {
    expect(diffMatchTable(published, { ...published })).toEqual([])
    expect(diffMatchTable(published, { ...published, fullMatch: [falseRow, trueRow] })).toEqual([])
    expect(changeMessages([])).toEqual(['和線上的對答表相比沒有變動'])
  })

  it('停用一列時列出少了哪一列', () => {
    expect(diffMatchTable(published, { ...published, fullMatch: [trueRow] })).toEqual([
      '完整答案對答表：少了（停用或刪除）標準答案「false」、輸入答案「╳ X x ✕ ×」'
    ])
  })

  it('只改一列的輸入答案或科目時列為修改', () => {
    const next = { ...published, fullMatch: [trueRow, { ...falseRow, matchText: ['╳', 'X'], subjects: ['數學'] }] }
    expect(diffMatchTable(published, next)).toEqual([
      '完整答案對答表：修改標準答案「false」那列，輸入答案從「╳ X x ✕ ×」改成「╳ X」，科目從「全部科目」改成「數學」'
    ])
  })

  it('同一個標準答案有多列時，改其中一列仍列為修改；新增的列列為多了', () => {
    const next = {
      ...published,
      partialMatch: [{ primeText: '≧', matchText: ['≥', '≧'] }, { primeText: '≧', matchText: ['>='] }, { primeText: '', matchText: ['《'] }]
    }
    expect(diffMatchTable(published, next)).toEqual([
      '部分答案對答表：修改標準答案「≧」那列，輸入答案從「≥」改成「≥ ≧」',
      '部分答案對答表：多了 標準答案「（刪除）」、輸入答案「《」'
    ])
  })

  it('開關變動用設定表上的規則名稱與勾選意思', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC'],
      ['規則名稱', '規則ID', '預設', '國文'],
      ['大小寫互通', 'caseFormatter', 'FALSE', 'TRUE'],
      ['國字中間的空白會去掉', 'removeHanSpace', 'FALSE', '']
    ]
    const before = { ...published, formatters: { caseFormatter: false }, subjects: { 國文: { formatters: { caseFormatter: true, keepHanSpace: true } } } }
    const after = { ...published, formatters: { caseFormatter: true }, subjects: { 國文: { formatters: { caseFormatter: true, keepHanSpace: false } } } }
    expect(diffMatchTable(before, after, sheet)).toEqual([
      '設定表：「大小寫互通」的預設從「不勾」改成「勾選」',
      '設定表：「國字中間的空白會去掉」的國文從「不勾」改成「勾選」'
    ])
  })

  it('抓不到線上的表時說明無法比對', () => {
    expect(diffMatchTable(null, published)).toBeNull()
    expect(changeMessages(null)).toEqual(['抓不到線上的對答表，無法列出這次改了什麼'])
  })

  describe('科目改用代碼（kb-1006085）', () => {
    const named = {
      fullMatch: [trueRow],
      partialMatch: [{ primeText: '〉', matchText: ['>'], subjects: ['國文'] }],
      ruleSubjects: ['國文', '數學'],
      subjects: { 數學: { formatters: { numberFormatter: true } } }
    }
    const keyed = {
      fullMatch: [trueRow],
      partialMatch: [{ primeText: '〉', matchText: ['>'], subjects: ['PC'] }],
      ruleSubjects: ['PC', 'MA'],
      subjects: { MA: { formatters: { numberFormatter: true } } }
    }

    it('線上的表還是科目名稱、這次轉成代碼時，只換寫法不算變動', () => {
      expect(diffMatchTable(named, keyed)).toEqual([])
    })

    it('真的有變動時，訊息裡的科目寫成科目名稱', () => {
      const changed = {
        ...keyed,
        partialMatch: [{ primeText: '〉', matchText: ['>'], subjects: ['PC', 'MA'] }],
        subjects: { MA: { formatters: { numberFormatter: false } } }
      }
      const settingsSheet = [['規則ID', '規則名稱', '預設', '數學'], ['numberFormatter', '去逗號判斷', '', 'FALSE']]
      expect(diffMatchTable(named, changed, settingsSheet)).toEqual([
        '部分答案對答表：修改標準答案「〉」那列，科目從「國文」改成「國文、數學」',
        '設定表：「去逗號判斷」的數學從「勾選」改成「不勾」'
      ])
    })
  })
})

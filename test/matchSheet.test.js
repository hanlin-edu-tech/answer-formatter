const { parseMatchSheet } = require('../scripts/libs/matchSheet')

describe('完整／部分答案對答分頁解析（sc-126462）', () => {
  const header = ['reload', 'enabled', '國文', '英文', '數學', '標準答案', '輸入答案', '', '']

  it('各科都勾的列不帶 subjects，部分勾選的列帶勾選的科目', () => {
    const sheet = [
      header,
      ['TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', '臺灣', '台灣', '', ''],
      ['TRUE', 'TRUE', 'TRUE', 'FALSE', 'TRUE', 'is not', "isn't", 'isn’t', '']
    ]
    expect(parseMatchSheet(sheet)).toEqual({
      rules: [
        { primeText: '臺灣', matchText: ['台灣'] },
        { primeText: 'is not', matchText: ["isn't", 'isn’t'], subjects: ['PC', 'MA'] }
      ],
      rulesV1: [
        { primeText: '臺灣', matchText: ['台灣'] },
        { primeText: 'is not', matchText: ["isn't", 'isn’t'] }
      ],
      subjectColumns: ['PC', 'EN', 'MA']
    })
  })

  it('科目一律輸出代碼，表頭寫科目名稱或代碼都可以（kb-1006085）', () => {
    const sheet = [['enabled', '國文', 'MA', '自然', '標準答案', '輸入答案'], ['TRUE', 'TRUE', 'TRUE', 'FALSE', '〉', '>']]
    const { rules, subjectColumns } = parseMatchSheet(sheet)
    expect(subjectColumns).toEqual(['PC', 'MA', 'NA'])
    expect(rules).toEqual([{ primeText: '〉', matchText: ['>'], subjects: ['PC', 'MA'] }])
  })

  it('同一科寫成名稱和代碼兩欄時算重複', () => {
    expect(() => parseMatchSheet([['enabled', '數學', 'MA', '標準答案', '輸入答案'], ['TRUE', 'TRUE', 'TRUE', '甲', 'A']])).toThrow(/duplicate subject column "MA"/)
  })

  it('enabled 為 FALSE 的列不輸出（v1、v2 都不含）', () => {
    const sheet = [header, ['TRUE', 'FALSE', 'TRUE', 'TRUE', 'TRUE', '臺灣', '台灣']]
    const { rules, rulesV1 } = parseMatchSheet(sheet)
    expect(rules).toEqual([])
    expect(rulesV1).toEqual([])
  })

  it('各科都不勾但 enabled 的列帶空的 subjects：不帶科目時仍套用，帶科目時都不套用', () => {
    const sheet = [header, ['TRUE', 'TRUE', 'FALSE', 'FALSE', 'FALSE', '甲', 'A']]
    expect(parseMatchSheet(sheet).rules).toEqual([{ primeText: '甲', matchText: ['A'], subjects: [] }])
  })

  it('標準答案空白（刪除類規則）照常輸出，空白列略過', () => {
    const sheet = [header, ['TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', '', '《'], ['', '', '', '', '', '', '']]
    expect(parseMatchSheet(sheet).rules).toEqual([{ primeText: '', matchText: ['《'] }])
  })

  it('沒有「標準答案」表頭時當成舊格式：第一欄標準答案、不分科', () => {
    const sheet = [['臺灣', '台灣', ''], ['', '《']]
    expect(parseMatchSheet(sheet)).toEqual({
      rules: [{ primeText: '臺灣', matchText: ['台灣'] }, { primeText: '', matchText: ['《'] }],
      rulesV1: [{ primeText: '臺灣', matchText: ['台灣'] }, { primeText: '', matchText: ['《'] }],
      subjectColumns: []
    })
  })

  it.each([
    ['勾選欄不是 TRUE / FALSE', [header, ['TRUE', 'TRUE', '是', 'TRUE', 'TRUE', '臺灣', '台灣']], /row 2 "國文" must be TRUE, FALSE or blank/],
    ['科目欄重複', [['enabled', '國文', '國文', '標準答案', '輸入答案'], ['TRUE', 'TRUE', 'TRUE', '臺灣', '台灣']], /duplicate subject column "國文"/]
  ])('%s時拋錯', (_, sheet, message) => {
    expect(() => parseMatchSheet(sheet)).toThrow(message)
  })
})

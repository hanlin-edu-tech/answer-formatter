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
      subjectColumns: ['PC', 'EN', 'MA'],
      rowNumbers: [2, 3],
      rows: [
        { rowNumber: 2, primeText: '臺灣', matchText: ['台灣'], enabled: true },
        { rowNumber: 3, primeText: 'is not', matchText: ["isn't", 'isn’t'], enabled: true }
      ]
    })
  })

  it('科目一律輸出代碼，表頭寫科目名稱或代碼都可以（kb-1006085）', () => {
    const sheet = [['enabled', '國文', 'MA', '自然', '標準答案', '輸入答案'], ['TRUE', 'TRUE', 'TRUE', 'FALSE', '〉', '>']]
    const { rules, subjectColumns } = parseMatchSheet(sheet)
    expect(subjectColumns).toEqual(['PC', 'MA', 'NA'])
    expect(rules).toEqual([{ primeText: '〉', matchText: ['>'], subjects: ['PC', 'MA'] }])
  })

  it('同一科寫成名稱和代碼兩欄時算重複（kb-1006085）', () => {
    const problems = []
    parseMatchSheet([['enabled', '數學', 'MA', '標準答案', '輸入答案'], ['TRUE', 'TRUE', 'TRUE', '甲', 'A']], problems)
    expect(problems).toEqual([{ location: 'B1、C1', text: ' 都是「數學」，同一科只能有一欄，請改回原本的科目名稱。' }])
  })

  it('enabled 為 FALSE 的列不輸出（v1、v2 都不含），rows 仍列出並標成停用', () => {
    const sheet = [header, ['TRUE', 'FALSE', 'TRUE', 'TRUE', 'TRUE', '臺灣', '台灣']]
    const { rules, rulesV1, rowNumbers, rows } = parseMatchSheet(sheet)
    expect(rules).toEqual([])
    expect(rulesV1).toEqual([])
    expect(rowNumbers).toEqual([])
    expect(rows).toEqual([{ rowNumber: 2, primeText: '臺灣', matchText: ['台灣'], enabled: false }])
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
      subjectColumns: [],
      rowNumbers: [1, 2],
      rows: [
        { rowNumber: 1, primeText: '臺灣', matchText: ['台灣'], enabled: true },
        { rowNumber: 2, primeText: '', matchText: ['《'], enabled: true }
      ]
    })
  })

  it.each([
    ['勾選欄不是 TRUE / FALSE', [header, ['TRUE', 'TRUE', 'abc', 'TRUE', 'TRUE', '臺灣', '台灣']],
      { location: 'C2（第 2 列「臺灣」的「國文」欄）', text: '填的是「abc」，這一格只能打勾或不打勾。' }],
    ['科目欄重複', [['enabled', '國文', '國文', '標準答案', '輸入答案'], ['TRUE', 'TRUE', 'TRUE', '臺灣', '台灣']],
      { location: 'B1、C1', text: ' 都是「國文」，同一科只能有一欄，請改回原本的科目名稱。' }]
  ])('%s時列出要改的地方（kb-1005461）', (_, sheet, problem) => {
    const problems = []
    parseMatchSheet(sheet, problems)
    expect(problems).toEqual([problem])
  })

  it('填錯的勾選格當成空白、繼續解析，一次列出所有填錯的地方（kb-1005461）', () => {
    const sheet = [
      header,
      ['TRUE', 'TRUE', 'abc', 'TRUE', 'TRUE', '臺灣', '台灣'],
      ['TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', '裡', '裏'],
      ['TRUE', '是', 'TRUE', 'TRUE', 'TRUE', '於', '于']
    ]
    const problems = []
    const { rules } = parseMatchSheet(sheet, problems)
    expect(problems.map(({ location }) => location)).toEqual(['C2（第 2 列「臺灣」的「國文」欄）', 'B4（第 4 列「於」的「enabled」欄）'])
    expect(rules).toEqual([
      { primeText: '臺灣', matchText: ['台灣'], subjects: ['EN', 'MA'] },
      { primeText: '裡', matchText: ['裏'] },
      { primeText: '於', matchText: ['于'] }
    ])
  })
})

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
      globalRules: [],
      rulesV1: [
        { primeText: '臺灣', matchText: ['台灣'] },
        { primeText: 'is not', matchText: ["isn't", 'isn’t'] }
      ],
      subjectColumns: ['PC', 'EN', 'MA'],
      rowNumbers: [2, 3],
      globalRowNumbers: [],
      rows: [
        { rowNumber: 2, primeText: '臺灣', matchText: ['台灣'], enabled: true, global: false },
        { rowNumber: 3, primeText: 'is not', matchText: ["isn't", 'isn’t'], enabled: true, global: false }
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
    expect(rows).toEqual([{ rowNumber: 2, primeText: '臺灣', matchText: ['台灣'], enabled: false, global: false }])
  })

  it('全域替換勾了的列放進 globalRules，不算科目欄、也不放進 v1', () => {
    const sheet = [
      ['enabled', '全域替換', '國文', '英文', '標準答案', '輸入答案'],
      ['TRUE', 'TRUE', 'TRUE', 'FALSE', '濕', '溼'],
      ['TRUE', 'FALSE', 'TRUE', 'TRUE', '臺', '台'],
      ['TRUE', '', 'TRUE', 'TRUE', '周期', '週期'],
      ['FALSE', 'TRUE', 'TRUE', 'TRUE', '萊茵', '萊因']
    ]
    const parsed = parseMatchSheet(sheet)
    expect(parsed.rules).toEqual([{ primeText: '臺', matchText: ['台'] }, { primeText: '周期', matchText: ['週期'] }])
    expect(parsed.globalRules).toEqual([{ primeText: '濕', matchText: ['溼'], subjects: ['PC'] }])
    expect(parsed.rulesV1).toEqual([{ primeText: '臺', matchText: ['台'] }, { primeText: '周期', matchText: ['週期'] }])
    expect(parsed.subjectColumns).toEqual(['PC', 'EN'])
    expect(parsed.rowNumbers).toEqual([3, 4])
    expect(parsed.globalRowNumbers).toEqual([2])
    expect(parsed.rows.map(({ rowNumber, enabled, global }) => [rowNumber, enabled, global])).toEqual([[2, true, true], [3, true, false], [4, true, false], [5, false, true]])
  })

  it('全域替換欄填錯時列出要改的地方，當成沒勾', () => {
    const problems = []
    const { rules, globalRules } = parseMatchSheet([['enabled', '全域替換', '國文', '標準答案', '輸入答案'], ['TRUE', '是', 'TRUE', '濕', '溼']], problems)
    expect(problems).toEqual([{ location: 'B2（第 2 列「濕」的「全域替換」欄）', text: '填的是「是」，這一格只能打勾或不打勾。' }])
    expect(globalRules).toEqual([])
    expect(rules).toEqual([{ primeText: '濕', matchText: ['溼'] }])
  })

  it('各科都不勾但 enabled 的列帶空的 subjects：不帶科目時仍套用，帶科目時都不套用', () => {
    const sheet = [header, ['TRUE', 'TRUE', 'FALSE', 'FALSE', 'FALSE', '甲', 'A']]
    expect(parseMatchSheet(sheet).rules).toEqual([{ primeText: '甲', matchText: ['A'], subjects: [] }])
  })

  it('標準答案空白（刪除類規則）照常輸出，空白列略過', () => {
    const sheet = [header, ['TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', '', '《'], ['', '', '', '', '', '', '']]
    expect(parseMatchSheet(sheet).rules).toEqual([{ primeText: '', matchText: ['《'] }])
  })

  it('找不到「標準答案」表頭時不解析，請編輯改回表頭（kb-1002894）', () => {
    const problems = []
    const parsed = parseMatchSheet([['enabled', '國文', '正規化答案', '輸入答案'], ['TRUE', 'TRUE', '臺灣', '台灣']], problems)
    expect(problems).toEqual([{ location: '第 1 列', text: '（表頭）找不到「標準答案」欄（英文表頭是 STANDARD），請改回原本的表頭；不確定的話請找工程。' }])
    expect(parsed.rules).toEqual([])
    expect(parsed.rulesV1).toEqual([])
  })

  it('空白分頁輸出空的規則，不列問題', () => {
    const problems = []
    expect(parseMatchSheet([['', ''], []], problems).rules).toEqual([])
    expect(problems).toEqual([])
  })

  describe('兩列表頭：英文欄位ID＋中文說明（kb-1002894）', () => {
    const keyHeader = ['enabled', 'GLOBAL', 'PC', 'EN', 'MA', 'NA', 'SO', 'STANDARD', 'INPUT', '', '']
    const description = ['', '全域替換', '國文', '英文', '數學', '自然', '社會', '正規化答案', '輸入答案', '', '']

    it('照英文ID解析，中文說明可以隨意改，資料從第 3 列起、列號照表上', () => {
      const sheet = [
        keyHeader,
        description,
        ['TRUE', 'FALSE', 'TRUE', 'FALSE', 'TRUE', 'TRUE', 'TRUE', 'is not', "isn't", 'isn’t'],
        ['', '', '', '', '', '', '', '', ''],
        ['TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', '濕', '溼']
      ]
      const problems = []
      const parsed = parseMatchSheet(sheet, problems)
      expect(problems).toEqual([])
      expect(parsed.subjectColumns).toEqual(['PC', 'EN', 'MA', 'NA', 'SO'])
      expect(parsed.rules).toEqual([{ primeText: 'is not', matchText: ["isn't", 'isn’t'], subjects: ['PC', 'MA', 'NA', 'SO'] }])
      expect(parsed.globalRules).toEqual([{ primeText: '濕', matchText: ['溼'] }])
      expect(parsed.rowNumbers).toEqual([3])
      expect(parsed.globalRowNumbers).toEqual([5])
    })

    it('ENABLED 大寫、小寫都認得；勾選格填錯時訊息寫科目名稱', () => {
      const problems = []
      const { rules } = parseMatchSheet([['ENABLED', 'MA', 'STANDARD', 'INPUT'], ['', '數學', '標準答案', '輸入答案'], ['TRUE', 'abc', '甲', 'A']], problems)
      expect(problems).toEqual([{ location: 'B3（第 3 列「甲」的「數學」欄）', text: '填的是「abc」，這一格只能打勾或不打勾。' }])
      expect(rules).toEqual([{ primeText: '甲', matchText: ['A'], subjects: [] }])
    })

    it('英文ID被改掉或打錯時不解析，指出是哪一格', () => {
      const problems = []
      const parsed = parseMatchSheet([['enabled', 'MATH', 'STANDARD', 'INPUT'], ['', '數學', '標準答案', '輸入答案'], ['TRUE', 'TRUE', '甲', 'A']], problems)
      expect(problems).toEqual([{ location: 'B1', text: ' 的英文欄位ID「MATH」不認得，只能填 ENABLED、GLOBAL、PC、EN、MA、NA、SO、STANDARD、INPUT。請改回原本的表頭；不確定的話請找工程。' }])
      expect(parsed.rules).toEqual([])
    })

    it('中文說明列被刪掉時不解析（英文表頭下一列是規則）', () => {
      const problems = []
      const parsed = parseMatchSheet([['enabled', 'PC', 'STANDARD', 'INPUT'], ['TRUE', 'TRUE', '臺灣', '台灣'], ['TRUE', 'TRUE', '裡', '裏']], problems)
      expect(problems).toEqual([{ location: '第 2 列', text: '是規則，但英文表頭下面一列要是中文說明。請在英文表頭下面加回說明列；不確定的話請找工程。' }])
      expect(parsed.rules).toEqual([])
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

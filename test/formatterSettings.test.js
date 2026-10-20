const { RULE_SWITCHES, parseFormatterSettings } = require('../scripts/libs/formatterSettings')
const { STEP_OF, STRUCTURAL_SWITCHES, checkRuleExamples } = require('../scripts/libs/ruleExamples')
const formatters = require('../src/libs/formatters')
const answerFormatter = require('../src/answerFormatter')

describe('設定表分頁解析（sc-126462）', () => {
  it('規則名稱對照涵蓋 SDK 所有可開關項目（總開關除外）', () => {
    const masters = ['fullwidthFormatter', 'removeSpaceFormatter']
    expect(Object.values(RULE_SWITCHES).sort()).toEqual(formatters.switchable.filter(name => !masters.includes(name)).sort())
  })

  it('全科寫到 formatters、各科寫到 subjects，空白不寫入（照 SDK 預設）', () => {
    const sheet = [
      ['規則名稱', '全科', '國文', '英文'],
      ['大小寫互通', 'FALSE', 'TRUE', ''],
      ['國字中間不會去空白', 'TRUE', 'FALSE', ' '],
      ['答案最後有句號：寫、沒寫句號都可以過關', 'y', '', 'N'],
      ['', '', '', '']
    ]
    expect(parseFormatterSettings(sheet)).toEqual({
      formatters: { caseFormatter: false, keepHanSpace: true, removeTailPeriodFormatter: true },
      subjects: {
        國文: { formatters: { caseFormatter: true, keepHanSpace: false } },
        英文: { formatters: { removeTailPeriodFormatter: false } }
      }
    })
  })

  it('規則名稱比對忽略空白', () => {
    const sheet = [['規則名稱', '全科'], ['LaTeX方程式轉成一般寫法', 'FALSE']]
    expect(parseFormatterSettings(sheet).formatters).toEqual({ latexFormatter: false })
  })

  it('接受「預設」欄作為全科 fallback，並解析新增的可設定規則', () => {
    const sheet = [
      ['規則名稱', '預設', '國文', '英文', '數學'],
      ['最外層成對引號可有可無', 'FALSE', 'FALSE', 'TRUE', 'FALSE'],
      ['最外層括號可有可無', 'TRUE', 'TRUE', 'TRUE', 'FALSE'],
      ['多個答案順序可互換', 'FALSE', 'TRUE', 'FALSE', 'TRUE'],
      ['± 可視同正負兩個答案', 'FALSE', 'FALSE', 'FALSE', 'TRUE'],
      ['括號因式順序可互換', 'FALSE', 'FALSE', 'FALSE', 'TRUE'],
      ['斜線全形半形互通', 'FALSE', 'FALSE', 'FALSE', 'TRUE']
    ]
    expect(parseFormatterSettings(sheet)).toEqual({
      formatters: {
        outerQuoteOptional: false,
        outerBracketOptional: true,
        answerOrder: false,
        mathPlusMinus: false,
        mathFactorOrder: false,
        fullwidthSlash: false
      },
      subjects: {
        國文: { formatters: { outerQuoteOptional: false, outerBracketOptional: true, answerOrder: true, mathPlusMinus: false, mathFactorOrder: false, fullwidthSlash: false } },
        英文: { formatters: { outerQuoteOptional: true, outerBracketOptional: true, answerOrder: false, mathPlusMinus: false, mathFactorOrder: false, fullwidthSlash: false } },
        數學: { formatters: { outerQuoteOptional: false, outerBracketOptional: false, answerOrder: true, mathPlusMinus: true, mathFactorOrder: true, fullwidthSlash: true } }
      }
    })
  })

  it('科目欄空白時沿用設定表預設，再由科目明確值覆蓋', () => {
    const original = answerFormatter.matchTable
    const parsed = parseFormatterSettings([
      ['規則名稱', '預設', '國文', '英文'],
      ['數字中間不會去空白', 'TRUE', 'FALSE', ''],
      ['國字中間不會去空白', 'TRUE', '', 'FALSE']
    ])
    answerFormatter.matchTable = { fullMatch: [], partialMatch: [], ...parsed }
    expect(answerFormatter.format('1 2', { subject: '英文' })).toBe('1 2')
    expect(answerFormatter.format('1 2', { subject: '國文' })).toBe('12')
    expect(answerFormatter.format('甲 乙', { subject: '國文' })).toBe('甲 乙')
    expect(answerFormatter.format('甲 乙', { subject: '英文' })).toBe('甲乙')
    answerFormatter.matchTable = original
  })

  it('改過名的規則仍認得舊名稱，新舊名稱並列時視為重複', () => {
    const settings = rule => parseFormatterSettings([['規則名稱', '預設'], [rule, 'FALSE']]).formatters
    expect(settings('數字中間不會去空白')).toEqual({ keepDigitSpace: false })
    expect(settings('數字中間有空白不會去掉')).toEqual({ keepDigitSpace: false })
    expect(() => parseFormatterSettings([
      ['規則名稱', '預設'],
      ['數字中間不會去空白', 'FALSE'],
      ['數字中間有空白不會去掉', 'TRUE']
    ])).toThrow('duplicate rule')
  })

  it('有規則ID欄時以 ID 比對，規則名稱可以自由改名，欄位不限位置', () => {
    const parsed = parseFormatterSettings([
      ['規則名稱', '預設', '規則ID', '英文'],
      ['數字中間的空白要保留（編輯改過名）', 'FALSE', 'keepDigitSpace', 'TRUE'],
      ['', 'TRUE', 'caseFormatter', '']
    ])
    expect(parsed).toEqual({
      formatters: { keepDigitSpace: false, caseFormatter: true },
      subjects: { 英文: { formatters: { keepDigitSpace: true } } }
    })
  })

  it('有列出但整欄空白的科目寫入空的 formatters，SDK 才不會退回全科', () => {
    const sheet = [['規則名稱', '全科', '數學'], ['大小寫互通', 'TRUE', '']]
    expect(parseFormatterSettings(sheet).subjects).toEqual({ 數學: { formatters: {} } })
  })

  it('空分頁回傳空設定', () => {
    expect(parseFormatterSettings([])).toEqual({ formatters: {}, subjects: {} })
    expect(parseFormatterSettings([['', '']])).toEqual({ formatters: {}, subjects: {} })
  })

  it.each([
    ['表頭沒有規則名稱', [['科目', '全科'], ['大小寫互通', 'TRUE']], /header must have "規則名稱"/],
    ['不認得的規則', [['規則名稱', '全科'], ['去空格', 'TRUE']], /unknown rule "去空格"/],
    ['重複的規則', [['規則名稱', '全科'], ['大小寫互通', 'TRUE'], ['大小寫互通', 'FALSE']], /duplicate rule/],
    ['重複的科目', [['規則名稱', '國文', '國文'], ['大小寫互通', 'TRUE', 'FALSE']], /duplicate subject/],
    ['重複的預設欄', [['規則名稱', '預設', '全科'], ['大小寫互通', 'TRUE', 'FALSE']], /only one default column/],
    ['TRUE / FALSE 以外的值', [['規則名稱', '全科'], ['大小寫互通', '是']], /must be TRUE, FALSE or blank/],
    ['沒有規則名稱的列', [['規則名稱', '全科'], ['', 'TRUE']], /no rule name \(row 2\)/],
    ['有規則ID欄但 ID 空白', [['規則ID', '規則名稱', '全科'], ['', '大小寫互通', 'TRUE']], /rule "大小寫互通" has no 規則ID \(row 2\)/],
    ['不認得的規則ID', [['規則ID', '規則名稱', '全科'], ['caseFormater', '大小寫互通', 'TRUE']], /unknown 規則ID "caseFormater"/],
    ['規則ID重複', [['規則ID', '規則名稱', '全科'], ['caseFormatter', '大小寫互通', 'TRUE'], ['caseFormatter', '大小寫可互通', 'FALSE']], /duplicate rule/],
    ['空白表頭底下有值', [['規則名稱', '全科', ''], ['大小寫互通', 'TRUE', 'FALSE']], /empty header/]
  ])('%s時拋錯', (_, sheet, message) => {
    expect(() => parseFormatterSettings(sheet)).toThrow(message)
  })
})

describe('規則表範例檢查（sc-126462）', () => {
  const table = { fullMatch: [], partialMatch: [] }
  const header = ['規則名稱', '標準寫法', '其他寫法', '其他寫法']

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('開啟規則時相等的範例通過；保留空白類規則開啟時應不相等', () => {
    const sheet = [
      header,
      ['答案最後有句號：寫、沒寫句號都可以過關', '七七事變', '七七事變。'],
      ['去逗號判斷', '12345678', '12，345‚678', '12,345,678'],
      ['數字中間不會去空白', '123', '1  2  3'],
      ['國字中間不會去空白', '法家', '法    家'],
      ['去題號', 'apple', '①apple']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
  })

  it('會用對應科目檢查引號、外層括號與數學結構規則', () => {
    const sheet = [
      header,
      ['最外層成對引號可有可無', 'answer', '"answer"'],
      ['最外層括號可有可無', 'answer', '(answer)'],
      ['多個答案順序可互換', '1,2', '2,1'],
      ['± 可視同正負兩個答案', '3，-3', '±3'],
      ['括號因式順序可互換', '(x+1)(x-2)', '(x-2)(x+1)']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
  })

  it('範例不符時列出是哪一列', () => {
    const sheet = [header, ['大小寫互通', 'a', 'b']]
    const { failures } = checkRuleExamples(answerFormatter, table, sheet)
    expect(failures).toEqual(['第 2 列「大小寫互通」：「a」與「b」開啟時應判定相等，實際不相等'])
  })

  it('關閉規則時結果相同的範例列為警告，不算失敗', () => {
    const sheet = [header, ['大小寫互通', 'a', 'a']]
    const { failures, warnings } = checkRuleExamples(answerFormatter, table, sheet)
    expect(failures).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it.each([
    ['不認得的規則', [header, ['去空格', 'a', 'b']], /不認得的規則「去空格」/],
    ['沒有其他寫法', [header, ['大小寫互通', 'a', '']], /沒有其他寫法/],
    ['表頭沒有規則名稱', [['規則', '標準寫法'], ['大小寫互通', 'a', 'A']], /header must have "規則名稱"/],
    ['有規則ID欄但 ID 空白', [['規則ID', '規則名稱', '標準寫法', '其他寫法'], ['', '大小寫互通', 'a', 'A']], /第 2 列：「大小寫互通」沒有填規則ID/],
    ['不認得的規則ID', [['規則ID', '規則名稱', '標準寫法', '其他寫法'], ['caseFormater', '大小寫互通', 'a', 'A']], /第 2 列：不認得的規則ID「caseFormater」/]
  ])('%s時列為失敗', (_, sheet, message) => {
    expect(checkRuleExamples(answerFormatter, table, sheet).failures.join('\n')).toMatch(message)
  })

  it('有規則ID欄時以 ID 比對，規則名稱可改名；範例欄扣掉規則ID、規則名稱與對答呈現欄', () => {
    const sheet = [
      ['規則名稱', '規則ID', '標準寫法', '輸入答案', '對答呈現'],
      ['英文大寫小寫都算對（編輯改過名）', 'caseFormatter', 'a', 'A', 'a'],
      ['數字之間的空白要留著', 'keepDigitSpace', '123', '1  2  3', '1 2 3']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
  })

  describe('對答呈現：輸入答案經過規則後的結果', () => {
    const outputHeader = ['規則名稱', '標準寫法', '輸入答案', '對答呈現']

    it('每個可開關的規則都對應到 SDK 的步驟或結構比對', () => {
      const steps = formatters.map(formatter => formatter.formatterName)
      for (const name of Object.values(RULE_SWITCHES)) {
        expect(STRUCTURAL_SWITCHES.includes(name) || steps.includes(STEP_OF[name] || name)).toBe(true)
      }
    })

    it('只看該規則的步驟：前面的步驟算進去、後面的對答表與其他科開關不算', () => {
      const sheet = [
        outputHeader,
        ['答案最後有句號：寫、沒寫句號都可以過關', '七七事變', '七七事變。', '七七事變'],
        ['去逗號判斷', '12345678', '12，345‚678', '12345678'],
        ['數字中間不會去空白', '123', '1  2  3', '1 2 3'],
        ['間隔號互通（．·‧）', '切·格瓦拉', '切．格瓦拉', '切·格瓦拉'],
        ['最外層成對引號可有可無', '本紀', '"本紀"', '本紀'],
        ['最外層括號可有可無', 'A', '(A)', 'A'],
        ['多個答案順序可互換', '甲、乙、丙', '乙、丙、甲', '甲、乙、丙'],
        ['± 可視同正負兩個答案', '±3', '3，-3', '±3'],
        ['括號因式順序可互換', '(x+1)(x-2)', '(x-2)(x+1)', '(x+1)(x-2)']
      ]
      const fullMatch = [{ primeText: '盧溝橋事變', matchText: ['七七事變'] }]
      expect(checkRuleExamples(answerFormatter, { ...table, fullMatch }, sheet).failures).toEqual([])
    })

    it('結果與對答呈現不同時列為失敗，對答呈現欄不當成其他寫法', () => {
      const sheet = [outputHeader, ['數字中間不會去空白', '123', '1  2  3', '1  2  3'], ['大小寫互通', 'a', 'A', 'a']]
      expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({
        failures: ['第 2 列「數字中間不會去空白」：「1  2  3」經過規則後是「1 2 3」，對答呈現填的是「1  2  3」'],
        warnings: []
      })
    })

    it('結構比對類規則判定不等於對答呈現時列為失敗', () => {
      const sheet = [outputHeader, ['多個答案順序可互換', '甲、乙', '乙、甲', '甲、丙']]
      expect(checkRuleExamples(answerFormatter, table, sheet).failures).toEqual(['第 2 列「多個答案順序可互換」：「乙、甲」開啟時應判定等於對答呈現「甲、丙」，實際不相等'])
    })

    it('對答呈現空白只列為警告', () => {
      const sheet = [outputHeader, ['年代寫法互通（1980s＝1980年代）', '1980年代', '1980s', '']]
      expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: ['第 2 列「年代寫法互通（1980s＝1980年代）」：沒有填對答呈現'] })
    })
  })

  it('檢查完還原 SDK 原本的 matchTable', () => {
    const original = answerFormatter.matchTable
    checkRuleExamples(answerFormatter, table, [header, ['大小寫互通', 'a', 'A']])
    expect(answerFormatter.matchTable).toBe(original)
  })
})

const { RULE_IDS, parseFormatterSettings, switchOf } = require('../scripts/libs/formatterSettings')
const { STEP_OF, STRUCTURAL_SWITCHES, checkRuleExamples } = require('../scripts/libs/ruleExamples')
const formatters = require('../src/libs/formatters')
const answerFormatter = require('../src/answerFormatter')

describe('設定表分頁解析（sc-126462）', () => {
  it('規則ID涵蓋 SDK 所有可開關項目（總開關除外）', () => {
    const masters = ['fullwidthFormatter', 'removeSpaceFormatter']
    expect(RULE_IDS.map(id => switchOf(id).name).sort()).toEqual(formatters.switchable.filter(name => !masters.includes(name)).sort())
  })

  it('中間空白三條用正面說法：勾選＝空白會去掉，轉檔時反轉成 SDK 的保留空白開關（kb-1005022）', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'MA', 'NA'],
      ['規則名稱', '規則ID', '預設', '數學', '自然'],
      ['數字中間的空白會去掉', 'removeDigitSpace', 'TRUE', 'TRUE', ''],
      ['國字中間的空白會去掉', 'removeHanSpace', 'TRUE', '', 'FALSE'],
      ['英文字中間的空白會去掉', 'removeLatinSpace', 'TRUE', 'FALSE', '']
    ]
    const warnings = []
    expect(parseFormatterSettings(sheet, warnings)).toEqual({
      formatters: { keepDigitSpace: false, keepHanSpace: false, keepLatinSpace: false },
      subjects: { 數學: { formatters: { keepDigitSpace: false, keepLatinSpace: true } }, 自然: { formatters: { keepHanSpace: true } } }
    })
    expect(warnings).toEqual([])
  })

  it('改名前的保留空白 ID 照舊解析並提示改用新 ID，與新 ID 同時出現算重複（kb-1005022）', () => {
    const warnings = []
    const parsed = parseFormatterSettings([['規則ID', '規則名稱', '預設'], ['keepHanSpace', '國字中間不會去空白', 'FALSE']], warnings)
    expect(parsed).toEqual({ formatters: { keepHanSpace: false }, subjects: {} })
    expect(warnings).toEqual(['設定表第 2 列「國字中間不會去空白」（keepHanSpace）：請改用 removeHanSpace，勾選的意思相反（勾選＝空白會去掉）'])
    expect(() => parseFormatterSettings([
      ['規則ID', '規則名稱', '預設'],
      ['keepHanSpace', '國字中間不會去空白', 'FALSE'],
      ['removeHanSpace', '國字中間的空白會去掉', 'TRUE']
    ])).toThrow(/duplicate rule/)
  })

  it('改名後照新意思反轉勾選，發布的設定與改名前完全相同（kb-1005022）', () => {
    const before = parseFormatterSettings([
      ['規則ID', '預設', '國文', '自然'],
      ['keepDigitSpace', 'FALSE', 'FALSE', 'FALSE'],
      ['keepHanSpace', 'FALSE', 'FALSE', 'TRUE'],
      ['keepLatinSpace', 'FALSE', '', 'FALSE']
    ])
    const after = parseFormatterSettings([
      ['規則ID', '預設', '國文', '自然'],
      ['removeDigitSpace', 'TRUE', 'TRUE', 'TRUE'],
      ['removeHanSpace', 'TRUE', 'TRUE', 'FALSE'],
      ['removeLatinSpace', 'TRUE', '', 'TRUE']
    ])
    expect(after).toEqual(before)
  })

  it('全科寫到 formatters、各科寫到 subjects，空白不寫入（照 SDK 預設）', () => {
    const sheet = [
      ['規則ID', '規則名稱', '全科', '國文', '英文'],
      ['caseFormatter', '大小寫互通', 'FALSE', 'TRUE', ''],
      ['keepHanSpace', '國字中間不會去空白', 'TRUE', 'FALSE', ' '],
      ['removeTailPeriodFormatter', '答案最後有句號：寫、沒寫句號都可以過關', 'y', '', 'N'],
      ['', '', '', '', '']
    ]
    expect(parseFormatterSettings(sheet)).toEqual({
      formatters: { caseFormatter: false, keepHanSpace: true, removeTailPeriodFormatter: true },
      subjects: {
        國文: { formatters: { caseFormatter: true, keepHanSpace: false } },
        英文: { formatters: { removeTailPeriodFormatter: false } }
      }
    })
  })

  it('接受「預設」欄作為全科 fallback，並解析新增的可設定規則', () => {
    const sheet = [
      ['規則ID', '規則名稱', '預設', '國文', '英文', '數學'],
      ['outerQuoteOptional', '最外層成對引號可有可無', 'FALSE', 'FALSE', 'TRUE', 'FALSE'],
      ['outerBracketOptional', '最外層括號可有可無', 'TRUE', 'TRUE', 'TRUE', 'FALSE'],
      ['answerOrder', '多個答案順序可互換', 'FALSE', 'TRUE', 'FALSE', 'TRUE'],
      ['mathPlusMinus', '± 可視同正負兩個答案', 'FALSE', 'FALSE', 'FALSE', 'TRUE'],
      ['mathFactorOrder', '括號因式順序可互換', 'FALSE', 'FALSE', 'FALSE', 'TRUE'],
      ['fullwidthSlash', '斜線全形半形互通', 'FALSE', 'FALSE', 'FALSE', 'TRUE']
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
      ['規則ID', '規則名稱', '預設', '國文', '英文'],
      ['keepDigitSpace', '數字中間不會去空白', 'TRUE', 'FALSE', ''],
      ['keepHanSpace', '國字中間不會去空白', 'TRUE', '', 'FALSE']
    ])
    answerFormatter.matchTable = { fullMatch: [], partialMatch: [], ...parsed }
    expect(answerFormatter.format('1 2', { subject: '英文' })).toBe('1 2')
    expect(answerFormatter.format('1 2', { subject: '國文' })).toBe('12')
    expect(answerFormatter.format('甲 乙', { subject: '國文' })).toBe('甲 乙')
    expect(answerFormatter.format('甲 乙', { subject: '英文' })).toBe('甲乙')
    answerFormatter.matchTable = original
  })

  it('以規則ID比對：規則名稱可以自由改名或留空，欄位不限位置', () => {
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

  it('兩列表頭：讀第 1 列英文鍵，第 2 列中文說明可隨意改，科目代碼轉成中文科目', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC', 'EN'],
      ['規則（編輯改過）', '規則ID\n（程式讀取用）', '全部', '國語文', 'English'],
      ['數字之間的空白保留', 'keepDigitSpace', 'FALSE', '', 'TRUE'],
      ['大小寫互通', 'caseFormatter', 'FALSE', 'TRUE', '']
    ]
    expect(parseFormatterSettings(sheet)).toEqual({
      formatters: { keepDigitSpace: false, caseFormatter: false },
      subjects: { 國文: { formatters: { caseFormatter: true } }, 英文: { formatters: { keepDigitSpace: true } } }
    })
  })

  it('錯誤訊息的列號對應 Sheet 上的列號，中間的空白列也算', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT'],
      ['規則名稱', '規則ID', '預設'],
      ['大小寫互通', 'caseFormatter', 'TRUE'],
      ['', '', ''],
      ['去逗號判斷', 'numberFormater', 'TRUE']
    ]
    expect(() => parseFormatterSettings(sheet)).toThrow('unknown 規則ID "numberFormater" (row 5)')
  })

  it('兩列表頭的中文說明列被刪掉時拋錯，不會把第一條規則當成說明列略過', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT'],
      ['大小寫互通', 'caseFormatter', 'TRUE'],
      ['去逗號判斷', 'numberFormatter', 'FALSE']
    ]
    expect(() => parseFormatterSettings(sheet)).toThrow('row 2 is a rule row, but the row below the English header keys must be the description row')
  })

  it('有列出但整欄空白的科目寫入空的 formatters，SDK 才不會退回全科', () => {
    const sheet = [['規則ID', '規則名稱', '全科', '數學'], ['caseFormatter', '大小寫互通', 'TRUE', '']]
    expect(parseFormatterSettings(sheet).subjects).toEqual({ 數學: { formatters: {} } })
  })

  it('已拿掉的規則ID（全形空白）忽略並列為警告，不讓 job 失敗（kb-1005019）', () => {
    const warnings = []
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC'],
      ['規則名稱', '規則ID', '預設', '國文'],
      ['大小寫互通', 'caseFormatter', 'FALSE', 'TRUE'],
      ['空格：半形、全形都可以過關', 'fullwidthSpace', 'FALSE', 'FALSE']
    ]
    expect(parseFormatterSettings(sheet, warnings)).toEqual({
      formatters: { caseFormatter: false },
      subjects: { 國文: { formatters: { caseFormatter: true } } }
    })
    expect(warnings).toEqual(['設定表第 4 列「空格：半形、全形都可以過關」（fullwidthSpace）：全形空白一律當半形空白，開關已拿掉，這一列可以刪除'])
  })

  it('全形空白一律當半形空白，表上舊的 fullwidthSpace 開關不再生效（kb-1005019）', () => {
    const original = answerFormatter.matchTable
    for (const fullwidthSpace of [true, false]) {
      answerFormatter.matchTable = { fullMatch: [], partialMatch: [], formatters: { fullwidthSpace, keepHanSpace: true } }
      expect(answerFormatter.format('丁\u3000木質部')).toBe('丁 木質部')
      expect(answerFormatter.equals('丁\u3000木質部', '丁 木質部')).toBe(true)
    }
    answerFormatter.matchTable = original
  })

  it('空分頁回傳空設定', () => {
    expect(parseFormatterSettings([])).toEqual({ formatters: {}, subjects: {} })
    expect(parseFormatterSettings([['', '']])).toEqual({ formatters: {}, subjects: {} })
  })

  it.each([
    ['表頭沒有規則ID', [['規則名稱', '全科'], ['大小寫互通', 'TRUE']], /header must have "規則ID"/],
    ['規則ID空白', [['規則ID', '規則名稱', '全科'], ['', '大小寫互通', 'TRUE']], /rule "大小寫互通" has no 規則ID \(row 2\)/],
    ['規則ID與規則名稱都空白', [['規則ID', '規則名稱', '全科'], ['', '', 'TRUE']], /no 規則ID \(row 2\)/],
    ['不認得的規則ID', [['規則ID', '規則名稱', '全科'], ['caseFormater', '大小寫互通', 'TRUE']], /unknown 規則ID "caseFormater"/],
    ['規則ID重複', [['規則ID', '規則名稱', '全科'], ['caseFormatter', '大小寫互通', 'TRUE'], ['caseFormatter', '大小寫可互通', 'FALSE']], /duplicate rule/],
    ['重複的科目', [['規則ID', '國文', '國文'], ['caseFormatter', 'TRUE', 'FALSE']], /duplicate subject/],
    ['重複的預設欄', [['規則ID', '預設', '全科'], ['caseFormatter', 'TRUE', 'FALSE']], /only one default column/],
    ['TRUE / FALSE 以外的值', [['規則ID', '規則名稱', '全科'], ['caseFormatter', '大小寫互通', '是']], /must be TRUE, FALSE or blank/],
    ['空白表頭底下有值', [['規則ID', '全科', ''], ['caseFormatter', 'TRUE', 'FALSE']], /empty header/],
    ['兩列表頭有不認得的英文鍵', [['RULE_NAME', 'RULE_ID', 'DEFAULT', 'JP'], ['規則名稱', '規則ID', '預設', '日文'], ['大小寫互通', 'caseFormatter', 'TRUE', 'TRUE']], /unknown header key "JP"/]
  ])('%s時拋錯', (_, sheet, message) => {
    expect(() => parseFormatterSettings(sheet)).toThrow(message)
  })
})

describe('規則表範例檢查（sc-126462）', () => {
  const table = { fullMatch: [], partialMatch: [] }
  const header = ['規則ID', '規則名稱', '標準寫法', '其他寫法', '其他寫法']

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('開啟規則時相等的範例通過；保留空白類規則開啟時應不相等', () => {
    const sheet = [
      header,
      ['removeTailPeriodFormatter', '答案最後有句號：寫、沒寫句號都可以過關', '七七事變', '七七事變。'],
      ['numberFormatter', '去逗號判斷', '12345678', '12，345‚678', '12,345,678'],
      ['keepDigitSpace', '數字中間不會去空白', '123', '1  2  3'],
      ['keepHanSpace', '國字中間不會去空白', '法家', '法    家'],
      ['removeNumberingFormatter', '去題號', 'apple', '①apple']
    ]
    // 改名前的保留空白 ID 照舊檢查，另提示改用新 ID（kb-1005022）
    const { failures, warnings } = checkRuleExamples(answerFormatter, table, sheet)
    expect(failures).toEqual([])
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toMatch('請改用 removeDigitSpace')
  })

  it('會用對應科目檢查引號、外層括號與數學結構規則', () => {
    const sheet = [
      header,
      ['outerQuoteOptional', '最外層成對引號可有可無', 'answer', '"answer"'],
      ['outerBracketOptional', '最外層括號可有可無', 'answer', '(answer)'],
      ['answerOrder', '多個答案順序可互換', '1,2', '2,1'],
      ['mathPlusMinus', '± 可視同正負兩個答案', '3，-3', '±3'],
      ['mathFactorOrder', '括號因式順序可互換', '(x+1)(x-2)', '(x-2)(x+1)']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
  })

  it('範例不符時列出是哪一列', () => {
    const sheet = [header, ['caseFormatter', '大小寫互通', 'a', 'b']]
    const { failures } = checkRuleExamples(answerFormatter, table, sheet)
    expect(failures).toEqual(['第 2 列「大小寫互通」：「a」與「b」開啟時應判定相等，實際不相等'])
  })

  it('關閉規則時結果相同的範例列為警告，不算失敗', () => {
    const sheet = [header, ['caseFormatter', '大小寫互通', 'a', 'a']]
    const { failures, warnings } = checkRuleExamples(answerFormatter, table, sheet)
    expect(failures).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it.each([
    ['沒有其他寫法', [header, ['caseFormatter', '大小寫互通', 'a', '']], /沒有其他寫法/],
    ['表頭沒有規則ID', [['規則名稱', '標準寫法'], ['大小寫互通', 'a', 'A']], /header must have "規則ID"/],
    ['規則ID空白', [header, ['', '大小寫互通', 'a', 'A']], /第 2 列：「大小寫互通」沒有填規則ID/],
    ['不認得的規則ID', [header, ['caseFormater', '大小寫互通', 'a', 'A']], /第 2 列：不認得的規則ID「caseFormater」/]
  ])('%s時列為失敗', (_, sheet, message) => {
    expect(checkRuleExamples(answerFormatter, table, sheet).failures.join('\n')).toMatch(message)
  })

  it('以規則ID比對，規則名稱可改名；範例欄扣掉規則ID、規則名稱與對答呈現欄', () => {
    const sheet = [
      ['規則名稱', '規則ID', '標準寫法', '輸入答案', '對答呈現'],
      ['英文大寫小寫都算對（編輯改過名）', 'caseFormatter', 'a', 'A', 'a'],
      ['數字之間的空白要去掉', 'removeDigitSpace', '123', '1  2  3', '123']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
  })

  it('兩列表頭：讀第 1 列英文鍵，第 2 列中文略過，列號對應 Sheet（含空白列）', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'STANDARD', 'INPUT', 'DISPLAY'],
      ['規則名稱', '規則ID\n（程式讀取用）', '標準寫法', '輸入答案', '對答呈現'],
      ['大小寫互通', 'caseFormatter', 'a', 'A', 'a'],
      ['', '', '', '', ''],
      ['去逗號判斷', 'numberFormatter', '12345678', '12，345‚678', '999']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet).failures).toEqual(['第 5 列「去逗號判斷」：「12，345‚678」經過規則後是「12345678」，對答呈現填的是「999」'])
  })

  it('兩列表頭有不認得的英文鍵時列為失敗', () => {
    const sheet = [['RULE_NAME', 'RULE_ID', 'STANDARD', 'OTHER'], ['規則名稱', '規則ID', '標準寫法', '其他'], ['大小寫互通', 'caseFormatter', 'a', 'A']]
    expect(checkRuleExamples(answerFormatter, table, sheet).failures).toEqual(['Rule examples sheet: unknown header key "OTHER"'])
  })

  it('兩列表頭的中文說明列被刪掉時列為失敗', () => {
    const sheet = [['RULE_NAME', 'RULE_ID', 'STANDARD', 'INPUT'], ['大小寫互通', 'caseFormatter', 'a', 'A']]
    expect(checkRuleExamples(answerFormatter, table, sheet).failures).toEqual(['Rule examples sheet: row 2 is a rule row, but the row below the English header keys must be the description row'])
  })

  describe('對答呈現：輸入答案經過規則後的結果', () => {
    const outputHeader = ['規則ID', '規則名稱', '標準寫法', '輸入答案', '對答呈現']

    it('每個可開關的規則都對應到 SDK 的步驟或結構比對', () => {
      const steps = formatters.map(formatter => formatter.formatterName)
      for (const name of RULE_IDS) {
        expect(STRUCTURAL_SWITCHES.includes(name) || steps.includes(STEP_OF[name] || name)).toBe(true)
      }
    })

    it('只看該規則的步驟：前面的步驟算進去、後面的對答表與其他科開關不算', () => {
      const sheet = [
        outputHeader,
        ['removeTailPeriodFormatter', '答案最後有句號：寫、沒寫句號都可以過關', '七七事變', '七七事變。', '七七事變'],
        ['numberFormatter', '去逗號判斷', '12345678', '12，345‚678', '12345678'],
        ['keepDigitSpace', '數字中間不會去空白', '123', '1  2  3', '1 2 3'],
        ['interpunctFormatter', '間隔號互通（．·‧）', '切·格瓦拉', '切．格瓦拉', '切·格瓦拉'],
        ['outerQuoteOptional', '最外層成對引號可有可無', '本紀', '"本紀"', '本紀'],
        ['outerBracketOptional', '最外層括號可有可無', 'A', '(A)', 'A'],
        ['answerOrder', '多個答案順序可互換', '甲、乙、丙', '乙、丙、甲', '甲、乙、丙'],
        ['mathPlusMinus', '± 可視同正負兩個答案', '±3', '3，-3', '±3'],
        ['mathFactorOrder', '括號因式順序可互換', '(x+1)(x-2)', '(x-2)(x+1)', '(x+1)(x-2)']
      ]
      const fullMatch = [{ primeText: '盧溝橋事變', matchText: ['七七事變'] }]
      expect(checkRuleExamples(answerFormatter, { ...table, fullMatch }, sheet).failures).toEqual([])
    })

    it('結果與對答呈現不同時列為失敗，對答呈現欄不當成其他寫法', () => {
      const sheet = [outputHeader, ['removeDigitSpace', '數字中間的空白會去掉', '123', '1  2  3', '1  2  3'], ['caseFormatter', '大小寫互通', 'a', 'A', 'a']]
      expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({
        failures: ['第 2 列「數字中間的空白會去掉」：「1  2  3」經過規則後是「123」，對答呈現填的是「1  2  3」'],
        warnings: []
      })
    })

    it('結構比對類規則判定不等於對答呈現時列為失敗', () => {
      const sheet = [outputHeader, ['answerOrder', '多個答案順序可互換', '甲、乙', '乙、甲', '甲、丙']]
      expect(checkRuleExamples(answerFormatter, table, sheet).failures).toEqual(['第 2 列「多個答案順序可互換」：「乙、甲」開啟時應判定等於對答呈現「甲、丙」，實際不相等'])
    })

    it('對答呈現空白只列為警告', () => {
      const sheet = [outputHeader, ['yearFormatter', '年代寫法互通（1980s＝1980年代）', '1980年代', '1980s', '']]
      expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: ['第 2 列「年代寫法互通（1980s＝1980年代）」：沒有填對答呈現'] })
    })
  })

  it('中間空白三條的新 ID 開啟時應判定相等，對答呈現為去掉空白的結果（kb-1005022）', () => {
    const sheet = [
      ['規則ID', '規則名稱', '標準寫法', '輸入答案', '對答呈現'],
      ['removeDigitSpace', '數字中間的空白會去掉', '123', '1  2  3', '123'],
      ['removeHanSpace', '國字中間的空白會去掉', '法家', '法    家', '法家'],
      ['removeLatinSpace', '英文字中間的空白會去掉', 'CD', 'C D', 'CD']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
  })

  it('已拿掉的規則ID（全形空白）的範例略過並列為警告（kb-1005019）', () => {
    const sheet = [header, ['fullwidthSpace', '空格：半形、全形都可以過關', '甲 乙', '甲\u3000乙'], ['caseFormatter', '大小寫互通', 'a', 'A']]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({
      failures: [],
      warnings: ['規則表第 2 列「空格：半形、全形都可以過關」（fullwidthSpace）：全形空白一律當半形空白，開關已拿掉，這一列可以刪除']
    })
  })

  it('範例只看該規則本身，不受設定表其他開關影響（kb-1005017）', () => {
    const sheet = [
      header,
      ['mathPlusMinus', '± 可視同正負兩個答案', '±3', '3，-3'],
      ['outerBracketOptional', '最外層括號可有可無', 'A', '(A)'],
      ['keepHanSpace', '國字中間不會去空白', '法家', '法    家']
    ]
    const settings = {
      ...table,
      formatters: { caseFormatter: true, keepHanSpace: false },
      subjects: { 數學: { formatters: { answerOrder: false } }, 國文: { formatters: { removeSpaceFormatter: false } } }
    }
    expect(checkRuleExamples(answerFormatter, settings, sheet).failures).toEqual([])
    const outputSheet = [['規則ID', '規則名稱', '標準寫法', '輸入答案', '對答呈現'], ['outerBracketOptional', '最外層括號可有可無', 'A', '(A)', 'A']]
    expect(checkRuleExamples(answerFormatter, settings, outputSheet).failures).toEqual([])
  })

  it('檢查完還原 SDK 原本的 matchTable', () => {
    const original = answerFormatter.matchTable
    checkRuleExamples(answerFormatter, table, [header, ['caseFormatter', '大小寫互通', 'a', 'A']])
    expect(answerFormatter.matchTable).toBe(original)
  })
})

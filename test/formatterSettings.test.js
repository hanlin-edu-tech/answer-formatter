const { RULE_IDS, parseFormatterSettings, switchOf } = require('../scripts/libs/formatterSettings')
const { STEP_OF, STRUCTURAL_SWITCHES, checkRuleExamples } = require('../scripts/libs/ruleExamples')
const formatters = require('../src/libs/formatters')
const answerFormatter = require('../src/answerFormatter')
const { renderProblem } = require('../scripts/libs/editorMessages')

// 給編輯看的問題轉成訊息（分頁用預設名稱，見 editorMessages）
const rendered = problems => problems.map(problem => renderProblem(problem))
const settingsProblems = (sheet) => {
  const problems = []
  parseFormatterSettings(sheet, [], problems)
  return rendered(problems)
}

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
      subjects: { MA: { formatters: { keepDigitSpace: false, keepLatinSpace: true } }, NA: { formatters: { keepHanSpace: true } } }
    })
    expect(warnings).toEqual([])
  })

  it('改名前的保留空白 ID 照舊解析並提示改用新 ID，與新 ID 同時出現算重複（kb-1005022）', () => {
    const warnings = []
    const parsed = parseFormatterSettings([['規則ID', '規則名稱', '預設'], ['keepHanSpace', '國字中間不會去空白', 'FALSE']], warnings)
    expect(parsed).toEqual({ formatters: { keepHanSpace: false }, subjects: {} })
    expect(warnings).toEqual(['設定表第 2 列「國字中間不會去空白」（keepHanSpace）：請改用 removeHanSpace，勾選的意思相反（勾選＝空白會去掉），範例改成開啟時空白會去掉'])
    expect(settingsProblems([
      ['規則ID', '規則名稱', '預設'],
      ['keepHanSpace', '國字中間不會去空白', 'FALSE'],
      ['removeHanSpace', '國字中間的空白會去掉', 'TRUE']
    ])).toEqual(['「設定表」A2、A3 的規則ID「keepHanSpace」「removeHanSpace」是同一條規則（改名前後的規則ID），同一條規則只能有一列，請刪掉其中一列。'])
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
        PC: { formatters: { caseFormatter: true, keepHanSpace: false } },
        EN: { formatters: { removeTailPeriodFormatter: false } }
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
        PC: { formatters: { outerQuoteOptional: false, outerBracketOptional: true, answerOrder: true, mathPlusMinus: false, mathFactorOrder: false, fullwidthSlash: false } },
        EN: { formatters: { outerQuoteOptional: true, outerBracketOptional: true, answerOrder: false, mathPlusMinus: false, mathFactorOrder: false, fullwidthSlash: false } },
        MA: { formatters: { outerQuoteOptional: false, outerBracketOptional: false, answerOrder: true, mathPlusMinus: true, mathFactorOrder: true, fullwidthSlash: true } }
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
      subjects: { EN: { formatters: { keepDigitSpace: true } } }
    })
  })

  it('兩列表頭：讀第 1 列英文鍵，第 2 列中文說明可隨意改，科目一律轉成代碼（kb-1006085）', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC', 'EN'],
      ['規則（編輯改過）', '規則ID\n（程式讀取用）', '全部', '國語文', 'English'],
      ['數字之間的空白保留', 'keepDigitSpace', 'FALSE', '', 'TRUE'],
      ['大小寫互通', 'caseFormatter', 'FALSE', 'TRUE', '']
    ]
    expect(parseFormatterSettings(sheet)).toEqual({
      formatters: { keepDigitSpace: false, caseFormatter: false },
      subjects: { PC: { formatters: { caseFormatter: true } }, EN: { formatters: { keepDigitSpace: true } } }
    })
  })

  it('訊息的格子位置對應 Sheet 上的列號，中間的空白列也算', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT'],
      ['規則名稱', '規則ID', '預設'],
      ['大小寫互通', 'caseFormatter', 'TRUE'],
      ['', '', ''],
      ['去逗號判斷', 'numberFormater', 'TRUE']
    ]
    expect(settingsProblems(sheet)).toEqual(['「設定表」B5（第 5 列「去逗號判斷」的規則ID）填的是「numberFormater」，系統不認得。請改回原本的規則ID；不確定的話請找工程。'])
  })

  it('兩列表頭的中文說明列被刪掉時列為問題，不會把第一條規則當成說明列略過', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT'],
      ['大小寫互通', 'caseFormatter', 'TRUE'],
      ['去逗號判斷', 'numberFormatter', 'FALSE']
    ]
    expect(settingsProblems(sheet)).toEqual(['「設定表」第 2 列是規則，但英文表頭下面一列要是中文說明。請在英文表頭下面加回說明列；不確定的話請找工程。'])
  })

  it('有列出但整欄空白的科目寫入空的 formatters，SDK 才不會退回全科', () => {
    const sheet = [['規則ID', '規則名稱', '全科', '數學'], ['caseFormatter', '大小寫互通', 'TRUE', '']]
    expect(parseFormatterSettings(sheet).subjects).toEqual({ MA: { formatters: {} } })
  })

  it('同一張分頁的範例欄（標準寫法、輸入答案、對答呈現）不當成科目', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC', 'STANDARD', 'INPUT', 'DISPLAY'],
      ['規則名稱', '規則ID', '預設', '國文', '標準寫法', '輸入答案', '對答呈現'],
      ['大小寫互通', 'caseFormatter', 'FALSE', 'TRUE', 'a', 'A', 'a']
    ]
    expect(parseFormatterSettings(sheet)).toEqual({
      formatters: { caseFormatter: false },
      subjects: { PC: { formatters: { caseFormatter: true } } }
    })
  })

  it('備註欄不當成科目，也不當成範例（kb-1006379）', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC', 'NOTE', 'STANDARD', 'INPUT', 'DISPLAY'],
      ['規則名稱', '規則ID', '預設', '國文', '備註', '標準寫法', '輸入答案', '對答呈現'],
      ['其他全形符號互通', 'fullwidthSymbol', 'TRUE', 'FALSE', '！？；＋－＝％', 'a=b', 'ａ＝ｂ', 'a=b']
    ]
    const problems = []
    expect(parseFormatterSettings(sheet, [], problems)).toEqual({
      formatters: { fullwidthSymbol: true },
      subjects: { PC: { formatters: { fullwidthSymbol: false } } }
    })
    expect(problems).toEqual([])
    const { failures, warnings } = checkRuleExamples(answerFormatter, { fullMatch: [], partialMatch: [] }, sheet)
    expect(failures).toEqual([])
    expect(warnings).toEqual([])
    const singleHeader = [['規則ID', '規則名稱', '全科', '備註'], ['fullwidthSymbol', '其他全形符號互通', 'TRUE', '！？']]
    expect(parseFormatterSettings(singleHeader)).toEqual({ formatters: { fullwidthSymbol: true }, subjects: {} })
  })

  it('全形空白開關照一般規則解析，不再列為警告（kb-1005019）', () => {
    const warnings = []
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC'],
      ['規則名稱', '規則ID', '預設', '國文'],
      ['大小寫互通', 'caseFormatter', 'FALSE', 'TRUE'],
      ['空格：半形、全形都可以過關', 'fullwidthSpace', 'TRUE', 'FALSE']
    ]
    expect(parseFormatterSettings(sheet, warnings)).toEqual({
      formatters: { caseFormatter: false, fullwidthSpace: true },
      subjects: { PC: { formatters: { caseFormatter: true, fullwidthSpace: false } } }
    })
    expect(warnings).toEqual([])
  })

  it('全形空白開關：關閉時只有中間的全形空白和半形空白不同，頭尾照樣去掉（kb-1005019）', () => {
    const original = answerFormatter.matchTable
    answerFormatter.matchTable = { fullMatch: [], partialMatch: [], formatters: { fullwidthSpace: true, keepHanSpace: true } }
    expect(answerFormatter.format('丁\u3000木質部')).toBe('丁 木質部')
    expect(answerFormatter.format('丁\u3000\u3000木質部')).toBe('丁 木質部')
    expect(answerFormatter.equals('丁\u3000木質部', '丁 木質部')).toBe(true)

    answerFormatter.matchTable = { fullMatch: [], partialMatch: [], formatters: { fullwidthSpace: false, keepHanSpace: true } }
    expect(answerFormatter.format('丁\u3000木質部')).toBe('丁\u3000木質部')
    expect(answerFormatter.equals('丁\u3000木質部', '丁 木質部')).toBe(false)
    expect(answerFormatter.equals('丁\u3000木質部', '丁\u3000木質部')).toBe(true)
    // 全形旁邊夾的半形空白去掉，全形空白照原樣保留
    expect(answerFormatter.format('丁 \u3000木質部')).toBe('丁\u3000木質部')
    // 開頭、結尾的全形空白照樣去掉
    expect(answerFormatter.format('\u3000丁 木質部\u3000')).toBe('丁 木質部')
    expect(answerFormatter.equals('\u3000丁 木質部\u3000', '丁 木質部')).toBe(true)
    // 國字中間空白會去掉時，關閉全形空白開關仍讓全形空白留下
    answerFormatter.matchTable = { fullMatch: [], partialMatch: [], formatters: { fullwidthSpace: false, keepHanSpace: false } }
    expect(answerFormatter.equals('丁\u3000木質部', '丁木質部')).toBe(false)
    answerFormatter.matchTable = original
  })

  it('單列中文表頭的科目名稱也轉成代碼（kb-1006085）', () => {
    expect(parseFormatterSettings([['規則ID', '預設', '數學', '社會'], ['numberFormatter', 'FALSE', 'TRUE', '']])).toEqual({
      formatters: { numberFormatter: false },
      subjects: { MA: { formatters: { numberFormatter: true } }, SO: { formatters: {} } }
    })
  })

  it('空分頁回傳空設定', () => {
    expect(parseFormatterSettings([])).toEqual({ formatters: {}, subjects: {} })
    expect(parseFormatterSettings([['', '']])).toEqual({ formatters: {}, subjects: {} })
  })

  it.each([
    ['表頭沒有規則ID', [['規則名稱', '全科'], ['大小寫互通', 'TRUE']], '「設定表」第 1 列（表頭）找不到「規則ID」欄（英文表頭是 RULE_ID），請改回原本的表頭。'],
    ['規則ID空白', [['規則ID', '規則名稱', '全科'], ['', '大小寫互通', 'TRUE']], '「設定表」A2（第 2 列「大小寫互通」的規則ID）是空的，請填回規則ID。'],
    ['規則ID與規則名稱都空白', [['規則ID', '規則名稱', '全科'], ['', '', 'TRUE']], '「設定表」A2（第 2 列的規則ID）是空的，請填回規則ID。'],
    ['不認得的規則ID', [['規則ID', '規則名稱', '全科'], ['caseFormater', '大小寫互通', 'TRUE']], '「設定表」A2（第 2 列「大小寫互通」的規則ID）填的是「caseFormater」，系統不認得。請改回原本的規則ID；不確定的話請找工程。'],
    ['規則ID重複', [['規則ID', '規則名稱', '全科'], ['caseFormatter', '大小寫互通', 'TRUE'], ['caseFormatter', '大小寫可互通', 'FALSE']], '「設定表」A2、A3 的規則ID 都是「caseFormatter」，同一條規則只能有一列，請刪掉其中一列或改回原本的規則ID。'],
    ['重複的科目', [['規則ID', '國文', '國文'], ['caseFormatter', 'TRUE', 'FALSE']], '「設定表」B1、C1 都是「國文」，同一科只能有一欄，請改回原本的科目代碼。'],
    ['重複的預設欄', [['規則ID', '預設', '全科'], ['caseFormatter', 'TRUE', 'FALSE']], '「設定表」B1、C1 都是預設欄，只能有一欄，請刪掉其中一欄。'],
    ['TRUE / FALSE 以外的值', [['規則ID', '規則名稱', '全科'], ['caseFormatter', '大小寫互通', '是']], '「設定表」C2（第 2 列「大小寫互通」的「全科」欄）填的是「是」，這一格只能打勾或不打勾。'],
    ['空白表頭底下有值', [['規則ID', '全科', ''], ['caseFormatter', 'TRUE', 'FALSE']], '「設定表」C2 填了「FALSE」，但這一欄沒有表頭。請刪掉這格的內容，或在第 1 列填上科目代碼。'],
    ['兩列表頭有不認得的英文鍵', [['RULE_NAME', 'RULE_ID', 'DEFAULT', 'JP'], ['規則名稱', '規則ID', '預設', '日文'], ['大小寫互通', 'caseFormatter', 'TRUE', 'TRUE']], '「設定表」D1 的科目代碼「JP」不認得，只能填 DEFAULT、PC、EN、MA、NA、SO。']
  ])('%s時列出要改的地方（kb-1005461）', (_, sheet, message) => {
    expect(settingsProblems(sheet)).toEqual([message])
  })

  it('填錯的格子當成空白、有問題的列略過，繼續解析其他列（kb-1005461）', () => {
    const sheet = [
      ['規則ID', '規則名稱', '預設', '國文'],
      ['caseFormatter', '大小寫互通', 'abc', 'TRUE'],
      ['numberFormatterX', '去逗號判斷', 'TRUE', ''],
      ['yearFormatter', '年代寫法互通', 'FALSE', '']
    ]
    const problems = []
    expect(parseFormatterSettings(sheet, [], problems)).toEqual({
      formatters: { yearFormatter: false },
      subjects: { PC: { formatters: { caseFormatter: true } } }
    })
    expect(problems.map(({ location }) => location)).toEqual(['C2（第 2 列「大小寫互通」的「預設」欄）', 'A3（第 3 列「去逗號判斷」的規則ID）'])
  })
})

describe('設定表範例檢查（sc-126462）', () => {
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
    // 改名前的保留空白 ID 照舊檢查，改名提醒由設定解析產生（kb-1005022）
    const { failures, warnings } = checkRuleExamples(answerFormatter, table, sheet)
    expect(failures).toEqual([])
    expect(warnings).toEqual([])
  })

  it('會用對應科目檢查引號、外層括號與數學結構規則', () => {
    const sheet = [
      header,
      ['outerQuoteOptional', '最外層成對引號可有可無', 'answer', '"answer"'],
      ['outerBracketOptional', '最外層括號可有可無', 'answer', '(answer)'],
      ['answerOrder', '多個答案順序可互換', '1、2', '2、1'],
      ['mathPlusMinus', '± 可視同正負兩個答案', '3，-3', '±3'],
      ['mathFactorOrder', '括號因式順序可互換', '(x+1)(x-2)', '(x-2)(x+1)']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
  })

  it('用表上勾了該規則的科目檢查，別科限定的對答列不會蓋掉範例（kb-1006473）', () => {
    const dotTable = {
      ...table,
      partialMatch: [{ primeText: '˙', matchText: ['·', '．'], subjects: ['PC'] }],
      ruleSubjects: ['PC'],
      subjects: { PC: { formatters: { dotFormatter: false } }, MA: { formatters: { dotFormatter: true } } }
    }
    const sheet = [header, ['dotFormatter', '點的寫法', 'Fe2O3·nH2O', 'Fe2O3．nH2O']]
    expect(checkRuleExamples(answerFormatter, dotTable, sheet)).toEqual({ failures: [], warnings: [] })
    // 沒有科目勾時照舊不帶科目，國文限定的列會套用
    const unchecked = { ...dotTable, subjects: { PC: { formatters: { dotFormatter: false } } } }
    expect(checkRuleExamples(answerFormatter, unchecked, sheet).warnings).toEqual([
      '設定表第 2 列「點的寫法」：「Fe2O3·nH2O」與「Fe2O3．nH2O」關閉規則時結果相同，因為部分答案對答「˙」←「·」、部分答案對答「˙」←「.」已經把兩種寫法換成一樣，這條規則開或關都沒有差別；要讓規則生效，請刪掉對答表上的這個寫法'
    ])
  })

  it('範例不符時列出是哪一列', () => {
    const sheet = [header, ['caseFormatter', '大小寫互通', 'a', 'b']]
    const { failures } = checkRuleExamples(answerFormatter, table, sheet)
    expect(rendered(failures)).toEqual(['「設定表」第 2 列「大小寫互通」：其他寫法「b」照這條規則不會等於標準寫法「a」，請檢查 C2、D2。'])
  })

  it('關閉規則時結果相同的範例列為警告，不算失敗', () => {
    const sheet = [header, ['caseFormatter', '大小寫互通', 'a', 'a']]
    const { failures, warnings } = checkRuleExamples(answerFormatter, table, sheet)
    expect(failures).toEqual([])
    expect(warnings).toHaveLength(1)
  })

  it('沒有其他寫法時列為失敗，指出空著的格子', () => {
    const sheet = [header, ['caseFormatter', '大小寫互通', 'a', '']]
    expect(rendered(checkRuleExamples(answerFormatter, table, sheet).failures)).toEqual(['「設定表」D2（第 2 列「大小寫互通」的「其他寫法」）是空的；有填標準寫法就要填其他寫法。'])
  })

  it.each([
    ['表頭沒有規則ID', [['規則名稱', '標準寫法'], ['大小寫互通', 'a', 'A']]],
    ['規則ID空白', [header, ['', '大小寫互通', 'a', 'A']]],
    ['不認得的規則ID', [header, ['caseFormater', '大小寫互通', 'a', 'A']]],
    ['兩列表頭有不認得的英文鍵', [['RULE_NAME', 'RULE_ID', 'STANDARD', 'OTHER'], ['規則名稱', '規則ID', '標準寫法', '其他'], ['大小寫互通', 'caseFormatter', 'a', 'A']]],
    ['兩列表頭的中文說明列被刪掉', [['RULE_NAME', 'RULE_ID', 'STANDARD', 'INPUT'], ['大小寫互通', 'caseFormatter', 'a', 'A']]]
  ])('%s時由設定解析回報，範例檢查不重複列出（kb-1005461）', (_, sheet) => {
    expect(checkRuleExamples(answerFormatter, table, sheet).failures).toEqual([])
    expect(settingsProblems(sheet)).toHaveLength(1)
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
    expect(rendered(checkRuleExamples(answerFormatter, table, sheet).failures)).toEqual(['「設定表」E5（第 5 列「去逗號判斷」的「對答呈現」）填的是「999」。輸入答案「12，345‚678」照這條規則會變成「12345678」，請把 E5 改成「12345678」。'])
  })

  it('和開關同一張分頁時略過預設、各科欄；沒寫範例的規則只列為警告', () => {
    const sheet = [
      ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC', 'EN', 'STANDARD', 'INPUT', 'DISPLAY'],
      ['規則名稱', '規則ID', '預設', '國文', '英文', '標準寫法', '輸入答案', '對答呈現'],
      ['大小寫互通', 'caseFormatter', 'FALSE', 'TRUE', 'FALSE', 'a', 'A', 'a'],
      ['去題號', 'removeNumberingFormatter', 'FALSE', 'FALSE', 'TRUE', '', '', '']
    ]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: ['設定表第 4 列「去題號」：沒有範例'] })
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
        ['dotFormatter', '點的寫法', 'Fe2O3·nH2O', 'Fe2O3．nH2O', 'Fe2O3·nH2O'],
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
        failures: [{ sheet: 'settings', location: 'E2（第 2 列「數字中間的空白會去掉」的「對答呈現」）', text: '填的是「1  2  3」。輸入答案「1  2  3」照這條規則會變成「123」，請把 E2 改成「123」。' }],
        warnings: []
      })
    })

    it('結構比對類規則判定不等於對答呈現時列為失敗', () => {
      const sheet = [outputHeader, ['answerOrder', '多個答案順序可互換', '甲、乙', '乙、甲', '甲、丙']]
      expect(rendered(checkRuleExamples(answerFormatter, table, sheet).failures)).toEqual(['「設定表」E2（第 2 列「多個答案順序可互換」的「對答呈現」）填的是「甲、丙」，但輸入答案「乙、甲」照這條規則不會等於它，請檢查 D2、E2。'])
    })

    it('對答呈現空白只列為警告', () => {
      const sheet = [outputHeader, ['yearFormatter', '年代寫法互通（1980s＝1980年代）', '1980年代', '1980s', '']]
      expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: ['設定表第 2 列「年代寫法互通（1980s＝1980年代）」：沒有填對答呈現'] })
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

  it('全形空白開關的範例：開啟時相等、關閉時不相等，對答呈現是轉成半形的結果（kb-1005019）', () => {
    const sheet = [['規則ID', '規則名稱', '標準寫法', '輸入答案', '對答呈現'], ['fullwidthSpace', '空格：半形、全形都可以過關', '甲 乙', '甲\u3000乙', '甲 乙']]
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
  })

  it('開關被對答表蓋掉時，提醒指出是哪張表的哪個寫法', () => {
    const sheet = [header, ['fullwidthComma', '逗號：全形/半形都可以過關', '(4,8)', '(4，8)']]
    const overridden = { ...table, partialMatch: [{ primeText: ',', matchText: ['‚', '，'] }] }
    expect(checkRuleExamples(answerFormatter, overridden, sheet)).toEqual({
      failures: [],
      warnings: ['設定表第 2 列「逗號：全形/半形都可以過關」：「(4,8)」與「(4，8)」關閉規則時結果相同，因為部分答案對答「,」←「，」已經把兩種寫法換成一樣，這條規則開或關都沒有差別；要讓規則生效，請刪掉對答表上的這個寫法']
    })
    expect(checkRuleExamples(answerFormatter, table, sheet)).toEqual({ failures: [], warnings: [] })
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


describe('設定與範例提醒整合（kb-1005020）', () => {
  it('三條改名規則各提醒一次，保留不同的範例問題', () => {
    const sheet = [
      ['RULE_ID', 'RULE_NAME', 'DEFAULT', 'STANDARD', 'INPUT'],
      ['規則ID', '規則名稱', '預設', '標準寫法', '輸入答案'],
      ['keepDigitSpace', '數字空白', 'FALSE', '12', '1 2'],
      ['keepHanSpace', '國字空白', 'FALSE', '甲乙', '甲 乙'],
      ['keepLatinSpace', '英文空白', 'FALSE', 'ab', 'a b'],
      ['caseFormatter', '大小寫', 'TRUE', 'a', 'a']
    ]
    const warnings = []
    const settings = parseFormatterSettings(sheet, warnings)
    const checked = checkRuleExamples(answerFormatter, { fullMatch: [], partialMatch: [], ...settings }, sheet)
    expect(checked.failures).toEqual([])
    warnings.push(...checked.warnings)
    expect(warnings).toHaveLength(4)
    for (const id of ['keepDigitSpace', 'keepHanSpace', 'keepLatinSpace']) {
      expect(warnings.filter(w => w.includes(`（${id}）`))).toHaveLength(1)
    }
    expect(warnings[0]).toContain('勾選的意思相反')
    expect(warnings[0]).toContain('範例改成開啟時空白會去掉')
    expect(warnings[3]).toContain('設定表第 6 列')
    expect(warnings[3]).toContain('範例沒有展示到這條規則')
  })
})

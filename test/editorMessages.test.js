const answerFormatter = require('../src/answerFormatter')
const { getConfig } = require('../scripts/libs/config')
const { buildMatchTable } = require('../scripts/libs/matchTableBuilder')
const { fetchSheetWithRetry } = require('../scripts/libs/sheetFetcher')
const { SheetProblemsError, columnName, failureMessage, invisibleNote, quote, successMessage } = require('../scripts/libs/editorMessages')

const {
  FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS,
  FORMAT_RULE_SHEET_GID_PARTIAL_MATCH,
  FORMAT_RULE_SHEET_GID_FULL_MATCH
} = getConfig()
// Apps Script 帶入的分頁名稱（分頁編號 gid → 目前的分頁名稱）
const sheetNames = {
  [FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS]: '程式對答及正規答案維護_1027',
  [FORMAT_RULE_SHEET_GID_PARTIAL_MATCH]: '部分答案對答_1027',
  [FORMAT_RULE_SHEET_GID_FULL_MATCH]: '完整答案對答_1027'
}
const SETTINGS = '「程式對答及正規答案維護_1027」'
const NOT_UPLOADED = n => `更新失敗，這次沒有上傳。請修正下面 ${n} 個地方後再按一次：`
// 2026-11-02 10:30（台北）
const TIME = Date.UTC(2026, 10, 2, 2, 30)

// 和試算表相同的欄位配置：A 規則名稱、B 規則ID、C 預設、D～H 各科、I 標準寫法、J 輸入答案、K 對答呈現
const settingsSheet = () => [
  ['RULE_NAME', 'RULE_ID', 'DEFAULT', 'PC', 'EN', 'MA', 'NA', 'SO', 'STANDARD', 'INPUT', 'DISPLAY'],
  ['規則名稱', '規則ID', '預設', '國文', '英文', '數學', '自然', '社會', '標準寫法', '輸入答案', '對答呈現'],
  ['英文、數字、冒號：半形、全形都可以過關', 'fullwidthAlnum', 'TRUE', '', '', '', '', '', '', '', ''],
  ['空格：半形、全形都可以過關', 'fullwidthSpace', 'TRUE', '', '', '', '', '', '', '', ''],
  ['答案最後有句號：寫、沒寫句號都可以過關', 'removeTailPeriodFormatter', 'TRUE', '', '', '', '', '', '', '', ''],
  ['逗號：全形/半形都可以過關', 'fullwidthComma', 'TRUE', '', '', '', '', '', '', '', ''],
  ['去逗號判斷', 'numberFormatter', 'FALSE', '', '', 'TRUE', '', '', '', '', ''],
  ['大小寫互通', 'caseFormatter', 'FALSE', '', '', '', '', '', '', '', ''],
  ['括號全形半形互通', 'fullwidthBracket', 'TRUE', '', '', '', '', '', '', '', ''],
  ['第一個數字前面會去空白', 'trimLeadingDigit', 'TRUE', '', '', '', '', '', '123', ' 123', '123']
]
const matchHeader = ['reload', 'enabled', '國文', '英文', '數學', '自然', '社會', '標準答案', '輸入答案', '', '', '', '']
const fullSheet = (falseEnabled = 'TRUE') => [
  matchHeader,
  ['', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'true', '◯', '○', 'O', 'o'],
  ['', falseEnabled, 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'false', '╳', 'X', 'x', '✕', '×']
]
const partialSheet = () => [
  matchHeader,
  ['', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', '×', 'x', '*', '╳', '✕']
]
const sheets = () => ({ settingsSheet: settingsSheet(), partialSheet: partialSheet(), fullSheet: fullSheet(), variantSheet: null })

// 照 job 的流程產生表並檢查，回傳給編輯看的訊息（沒有問題時回傳成功訊息）
const run = async (edit = () => {}) => {
  const input = sheets()
  edit(input)
  const { problems } = await buildMatchTable(input, async () => answerFormatter, TIME)
  return problems.length ? failureMessage(new SheetProblemsError(problems), sheetNames).message : successMessage(TIME, 'TEST')
}

describe('按「建議答案更新」後給編輯看的訊息（kb-1005461 驗收）', () => {
  it('1. 什麼都不改：只顯示更新完成與時間，不列提醒', async () => {
    expect(await run()).toBe('更新完成（2026-11-02 10:30），測試機已套用。')
    expect(successMessage(TIME, 'PROD')).toBe('更新完成（2026-11-02 10:30），正式機已套用。')
  })

  it('2. 對答呈現填錯：K10 從 123 改成 999', async () => {
    expect(await run(s => { s.settingsSheet[9][10] = '999' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}K10（第 10 列「第一個數字前面會去空白」的「對答呈現」）填的是「999」。輸入答案「 123」（開頭有 1 個空白）照這條規則會變成「123」，請把 K10 改成「123」。`
    ].join('\n'))
  })

  it('3. 對答呈現多了看不見的空白：K10 改成「 123」', async () => {
    expect(await run(s => { s.settingsSheet[9][10] = ' 123' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}K10（第 10 列「第一個數字前面會去空白」的「對答呈現」）填的是「 123」（開頭有 1 個空白），應該是「123」，請刪掉開頭的空白。`
    ].join('\n'))
  })

  it('4. 規則ID 打錯：B7 改成 numberFormatterX', async () => {
    expect(await run(s => { s.settingsSheet[6][1] = 'numberFormatterX' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}B7（第 7 列「去逗號判斷」的規則ID）填的是「numberFormatterX」，系統不認得。請改回原本的規則ID；不確定的話請找工程。`
    ].join('\n'))
  })

  it('5. 勾選格填成文字：D7 改成 abc', async () => {
    expect(await run(s => { s.settingsSheet[6][3] = 'abc' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}D7（第 7 列「去逗號判斷」的「國文」欄）填的是「abc」，這一格只能打勾或不打勾。`
    ].join('\n'))
  })

  it('6. 兩個錯一起（第 2、5 項）：一次列出兩個地方', async () => {
    expect(await run(s => {
      s.settingsSheet[9][10] = '999'
      s.settingsSheet[6][3] = 'abc'
    })).toBe([
      NOT_UPLOADED(2),
      `1. ${SETTINGS}D7（第 7 列「去逗號判斷」的「國文」欄）填的是「abc」，這一格只能打勾或不打勾。`,
      `2. ${SETTINGS}K10（第 10 列「第一個數字前面會去空白」的「對答呈現」）填的是「999」。輸入答案「 123」（開頭有 1 個空白）照這條規則會變成「123」，請把 K10 改成「123」。`
    ].join('\n'))
  })

  it('7. 部分答案對答的科目勾選格改成文字 abc', async () => {
    expect(await run(s => { s.partialSheet[1][2] = 'abc' })).toBe([
      NOT_UPLOADED(1),
      '1. 「部分答案對答_1027」C2（第 2 列「×」的「國文」欄）填的是「abc」，這一格只能打勾或不打勾。'
    ].join('\n'))
  })

  it('8. 規則ID 沒填：B7 清空', async () => {
    expect(await run(s => { s.settingsSheet[6][1] = '' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}B7（第 7 列「去逗號判斷」的規則ID）是空的，請填回規則ID。`
    ].join('\n'))
  })

  it('9. 規則ID 重複：B8 改成 numberFormatter', async () => {
    expect(await run(s => { s.settingsSheet[7][1] = 'numberFormatter' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}B7、B8 的規則ID 都是「numberFormatter」，同一條規則只能有一列，請刪掉其中一列或改回原本的規則ID。`
    ].join('\n'))
  })

  it('10. 範例只有標準寫法：J10 清空', async () => {
    expect(await run(s => { s.settingsSheet[9][9] = '' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}J10（第 10 列「第一個數字前面會去空白」的「輸入答案」）是空的；有填標準寫法就要填輸入答案。`
    ].join('\n'))
  })

  it('11. 範例判定不對：J10 改成 456', async () => {
    expect(await run(s => { s.settingsSheet[9][9] = '456' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}第 10 列「第一個數字前面會去空白」：輸入答案「456」照這條規則不會等於標準寫法「123」，請檢查 I10、J10。`
    ].join('\n'))
  })

  it('12. 表頭被改：F1 從 MA 改成 MATH', async () => {
    expect(await run(s => { s.settingsSheet[0][5] = 'MATH' })).toBe([
      NOT_UPLOADED(1),
      `1. ${SETTINGS}F1 的科目代碼「MATH」不認得，只能填 DEFAULT、PC、EN、MA、NA、SO。`
    ].join('\n'))
  })

  it('13. 部分答案對答互相改寫：最後加兩列「甲 ← 乙」「乙 ← 甲」', async () => {
    expect(await run(s => {
      s.partialSheet.push(['', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', '甲', '乙'])
      s.partialSheet.push(['', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', 'TRUE', '乙', '甲'])
    })).toBe([
      NOT_UPLOADED(1),
      '1. 「部分答案對答_1027」第 3 列和第 4 列互相改寫（甲→乙→甲），請刪掉其中一列。'
    ].join('\n'))
  })

  it('其他系統依賴的列被停用：完整答案對答 false 那一列取消 enabled', async () => {
    expect(await run(s => { s.fullSheet = fullSheet('FALSE') })).toBe([
      NOT_UPLOADED(1),
      '1. 「完整答案對答_1027」第 3 列（false ← ╳、X、x、✕、×）被停用了。是非題作答時會送「false」，要靠這一列對到「╳」「×」「X」，否則所有是非題都會判錯。請把這一列的 enabled 勾回來。'
    ].join('\n'))
  })

  it('15. 連不上、讀不到試算表：請編輯稍後再試', async () => {
    const get = async () => { throw new Error('connect ETIMEDOUT') }
    const err = await fetchSheetWithRetry(get, 'https://example.com/sheet', { delays: [] }).catch(e => e)
    expect(failureMessage(err, sheetNames, TIME)).toEqual({ kind: 'unavailable', message: '更新失敗，這次沒有上傳。暫時連不上，請過幾分鐘再按一次；一直失敗請找工程。' })
  })

  it('16. 系統內部問題（載入不到對答程式）：請編輯找工程，附發生時間', async () => {
    const err = await buildMatchTable(sheets(), async () => { throw new Error('HTTP 403') }).catch(e => e)
    expect(err.message).toBe('Failed to load SDK for match table checks: HTTP 403')
    expect(failureMessage(err, sheetNames, TIME)).toEqual({ kind: 'internal', message: '更新失敗，這次沒有上傳。系統內部錯誤，請找工程（發生時間：2026-11-02 10:30）。' })
  })

  it('訊息不出現 HTTP 狀態碼、SDK 版本、英文句子', async () => {
    const messages = [
      await run(s => { s.settingsSheet[9][10] = '999' }),
      failureMessage(Object.assign(new Error('HTTP 500'), { kind: 'unavailable' })).message,
      failureMessage(new Error('Failed to upload v1/api/answerFormatter/matchTable.v2.json: HTTP 500'), {}, TIME).message
    ]
    for (const message of messages) {
      expect(message).not.toMatch(/HTTP|SDK|Failed|not uploaded/)
    }
  })

  it('沒帶分頁名稱時用預設名稱（Apps Script 還沒更新時）', async () => {
    const problems = [{ sheet: 'partialMatch', location: 'C2', text: '填的是「abc」，這一格只能打勾或不打勾。' }]
    expect(failureMessage(new SheetProblemsError(problems)).message).toBe(`${NOT_UPLOADED(1)}\n1. 「部分答案對答」C2填的是「abc」，這一格只能打勾或不打勾。`)
  })
})

describe('已拿掉的間隔號互通（kb-1005466）', () => {
  // 表上還留著那一列（勾了也一樣）：只列為提醒、照樣上傳；發布的表一律寫成關閉，舊版 SDK 預設開啟
  const withInterpunct = input => input.settingsSheet.push(['間隔號互通（．·‧）', 'interpunctFormatter', 'TRUE', 'TRUE', '', '', '', '', '切·格瓦拉', '切．格瓦拉', '切·格瓦拉'])

  it('表上還有這一列時不擋上傳，只列為提醒', async () => {
    const input = sheets()
    withInterpunct(input)
    const { problems, warnings } = await buildMatchTable(input, async () => answerFormatter, TIME)
    expect(problems).toEqual([])
    expect(warnings).toContain('設定表第 11 列「間隔號互通（．·‧）」（interpunctFormatter）：「間隔號互通」已拿掉（各科都沒勾，數學、自然改用「點的寫法」，kb-1005466），這一列可以刪掉')
  })

  it('發布的表固定寫成關閉，各科不帶這個開關', async () => {
    for (const edit of [() => {}, withInterpunct]) {
      const input = sheets()
      edit(input)
      const { matchTable } = await buildMatchTable(input, async () => answerFormatter, TIME)
      expect(matchTable.formatters.interpunctFormatter).toBe(false)
      expect(Object.values(matchTable.subjects).some(({ formatters }) => 'interpunctFormatter' in formatters)).toBe(false)
    }
  })
})

describe('訊息格式工具', () => {
  it('欄位順序轉成欄名', () => {
    expect([0, 10, 25, 26, 27, 51, 52].map(columnName)).toEqual(['A', 'K', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })

  it.each([
    ['123', ''],
    [' 123', '（開頭有 1 個空白）'],
    ['123  ', '（結尾有 2 個空白）'],
    [' 123 ', '（開頭有 1 個空白，結尾有 1 個空白）'],
    ['　123', '（開頭有 1 個全形空白）'],
    ['  ', '（整格都是空白，共 2 個）'],
    ['1\n2', '（中間有換行）'],
    ['1​2', '（有看不見的字元）'],
    ['', '']
  ])('看不見的字元寫出來：%j', (text, note) => {
    expect(invisibleNote(text)).toBe(note)
    expect(quote(text)).toBe(`「${text}」${note}`)
  })
})

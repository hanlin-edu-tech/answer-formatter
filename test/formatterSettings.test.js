const { FORMATTER_COLUMNS, parseFormatterSettings } = require('../scripts/libs/formatterSettings')
const formatters = require('../src/libs/formatters')

describe('科目設定分頁解析（sc-126462）', () => {
  it('表頭對照與 SDK 可開關的 formatter 完全一致', () => {
    expect(Object.values(FORMATTER_COLUMNS).sort()).toEqual([...formatters.switchable].sort())
  })

  it('全科寫到 formatters、各科寫到 subjects，空白不寫入（照 SDK 預設）', () => {
    const sheet = [
      ['科目', '不分大小寫', '去空白', '刪句尾句號'],
      ['全科', 'N', '', 'y'],
      ['E-EN', 'Y', ' ', ''],
      ['H-CH', '', 'N', ''],
      ['', '', '', '']
    ]
    expect(parseFormatterSettings(sheet)).toEqual({
      formatters: { caseFormatter: false, removeTailPeriodFormatter: true },
      subjects: {
        'E-EN': { formatters: { caseFormatter: true } },
        'H-CH': { formatters: { removeSpaceFormatter: false } }
      }
    })
  })

  it('有列出但整列空白的科目寫入空的 formatters，SDK 才不會退回全科', () => {
    const sheet = [
      ['科目', '不分大小寫'],
      ['全科', 'Y'],
      ['M-MA', '']
    ]
    expect(parseFormatterSettings(sheet).subjects).toEqual({ 'M-MA': { formatters: {} } })
  })

  it('空分頁回傳空設定', () => {
    expect(parseFormatterSettings([])).toEqual({ formatters: {}, subjects: {} })
    expect(parseFormatterSettings([['', '']])).toEqual({ formatters: {}, subjects: {} })
  })

  it.each([
    ['第一欄表頭不是科目', [['科別', '去空白'], ['全科', 'Y']], /first header/],
    ['不認得的表頭', [['科目', '去空格'], ['全科', 'Y']], /unknown column "去空格"/],
    ['重複的表頭', [['科目', '去空白', '去空白'], ['全科', 'Y', 'N']], /duplicate column/],
    ['Y / N 以外的值', [['科目', '去空白'], ['全科', '是']], /must be Y, N or blank/],
    ['沒有科目的列', [['科目', '去空白'], ['', 'Y']], /row 2 has no subject/],
    ['重複的科目', [['科目', '去空白'], ['E-EN', 'Y'], ['E-EN', 'N']], /duplicate subject/],
    ['空白表頭底下有值', [['科目', '去空白', ''], ['E-EN', 'Y', 'N']], /empty header/]
  ])('%s時拋錯', (_, sheet, message) => {
    expect(() => parseFormatterSettings(sheet)).toThrow(message)
  })
})

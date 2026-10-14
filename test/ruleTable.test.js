const { RULE_TABLE_PATH, convertRuleTableSheet, exportRuleTable } = require('../scripts/libs/ruleTable')

const SHEET = [
  ['規則名稱', '預設', '國文', '英文'],
  ['大小寫互通', 'FALSE', 'TRUE', 'FALSE'],
  ['去題號', 'FALSE', '', 'y'],
  ['', '', '', '']
]
const TABLE = {
  subjects: ['國文', '英文'],
  rules: [
    { ruleName: '大小寫互通', default: false, subjects: { 國文: true, 英文: false } },
    { ruleName: '去題號', default: false, subjects: { 國文: null, 英文: true } }
  ]
}

describe('規則表（設定表）JSON 轉檔', () => {
  it('照表上的樣子輸出：預設欄、各科勾選，空白為 null', () => {
    expect(convertRuleTableSheet(SHEET, 123)).toEqual({ updateTime: 123, ...TABLE })
  })

  it('舊表的「全科」欄也輸出到 default', () => {
    const sheet = [['規則名稱', '全科', '國文'], ['大小寫互通', 'TRUE', 'FALSE']]
    expect(convertRuleTableSheet(sheet, 1).rules).toEqual([
      { ruleName: '大小寫互通', default: true, subjects: { 國文: false } }
    ])
  })

  it.each([
    ['表頭錯誤', [['規則', '國文']], /first header/],
    ['規則名稱空白', [['規則名稱', '國文'], ['', 'TRUE']], /row 2 has no rule name/],
    ['不認得的規則', [['規則名稱', '國文'], ['不存在的規則', 'TRUE']], /unknown rule/],
    ['值不是 TRUE / FALSE', [['規則名稱', '國文'], ['大小寫互通', '是']], /must be TRUE, FALSE or blank/]
  ])('%s時拒絕輸出', (_, sheet, expected) => {
    expect(() => convertRuleTableSheet(sheet)).toThrow(expected)
  })

  it('取得工作表後上傳到指定的 S3 JSON 路徑', async () => {
    const getSheet = jest.fn().mockResolvedValue(SHEET)
    const uploadToS3 = jest.fn().mockResolvedValue({ Location: `https://tw-itembank-sandbox.s3.ap-east-2.amazonaws.com/${RULE_TABLE_PATH}` })
    const result = await exportRuleTable({
      getSheet,
      uploadToS3,
      gid: '470764885',
      bucket: 'tw-itembank-sandbox',
      region: 'ap-east-2',
      now: () => 456
    })

    expect(getSheet).toHaveBeenCalledWith('470764885')
    expect(uploadToS3).toHaveBeenCalledWith({ updateTime: 456, ...TABLE }, RULE_TABLE_PATH, { bucket: 'tw-itembank-sandbox', region: 'ap-east-2' })
    expect(result.location).toContain('/v1/api/answerFormatter/ruleTable.json')
  })

  it('S3 上傳失敗時回報錯誤', async () => {
    await expect(exportRuleTable({
      getSheet: jest.fn().mockResolvedValue(SHEET),
      uploadToS3: jest.fn().mockResolvedValue(null),
      gid: '470764885',
      bucket: 'tw-itembank-sandbox',
      region: 'ap-east-2'
    })).rejects.toThrow(/Failed to upload rule table/)
  })
})

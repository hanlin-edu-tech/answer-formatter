const { RETRY_DELAYS, fetchSheetWithRetry } = require('../scripts/libs/sheetFetcher')

describe('試算表分頁抓取重試（msGoogleDoc 代理）', () => {
  const URL = 'https://www.ehanlin.com.tw/msGoogleDoc/Spreadsheet!download?key=k&gid=1'
  const SHEET = [['臺灣', '台灣'], ['', '《']]
  // 代理在 Google Sheets API 超過每分鐘讀取配額時仍回 200，body 是錯誤物件
  const QUOTA_ERROR = { status: 200, data: { message: "<HttpError 429 when requesting https://sheets.googleapis.com/v4/spreadsheets/k?alt=json returned \"Quota exceeded for quota metric 'Read requests'\">" } }
  const OK = { status: 200, data: SHEET }
  const NO_WAIT = { delays: [0, 0, 0] }

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('拿到陣列直接回傳，不重試', async () => {
    const get = jest.fn().mockResolvedValue(OK)
    await expect(fetchSheetWithRetry(get, URL, NO_WAIT)).resolves.toBe(SHEET)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('200 但 body 是配額錯誤物件時視為失敗並重試', async () => {
    const get = jest.fn().mockResolvedValueOnce(QUOTA_ERROR).mockResolvedValueOnce(QUOTA_ERROR).mockResolvedValueOnce(OK)
    await expect(fetchSheetWithRetry(get, URL, NO_WAIT)).resolves.toBe(SHEET)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('非 200 與網路錯誤也會重試', async () => {
    const get = jest.fn().mockResolvedValueOnce({ status: 500, data: 'oops' }).mockRejectedValueOnce(new Error('socket hang up')).mockResolvedValueOnce(OK)
    await expect(fetchSheetWithRetry(get, URL, NO_WAIT)).resolves.toBe(SHEET)
  })

  it('重試用盡仍拿不到陣列時拋錯並帶出原因，避免上傳缺了分頁的表', async () => {
    const get = jest.fn().mockResolvedValue(QUOTA_ERROR)
    await expect(fetchSheetWithRetry(get, URL, NO_WAIT)).rejects.toThrow(/after 4 attempts.*Quota exceeded/)
    expect(get).toHaveBeenCalledTimes(4)
  })

  it('預設重試間隔累計超過一分鐘，撐得過同一個配額窗口', () => {
    expect(RETRY_DELAYS.reduce((sum, ms) => sum + ms, 0)).toBeGreaterThan(60000)
  })
})

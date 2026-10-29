// SDK 裝在 scripts/node_modules，依 api.js 實際載入的路徑 mock
jest.mock(require.resolve('../scripts/node_modules/@aws-sdk/client-s3'), () => {
  const send = jest.fn()
  return { S3Client: jest.fn(() => ({ send })), PutObjectCommand: jest.fn(input => input), __send: send }
})
const { __send: send } = require('../scripts/node_modules/@aws-sdk/client-s3')
const api = require('../scripts/libs/api')

describe('上傳 S3 失敗時讓 job 失敗（kb-1005828）', () => {
  beforeEach(() => {
    send.mockReset()
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => jest.restoreAllMocks())

  it('S3 拋錯時拋出帶檔案路徑的錯誤', async () => {
    send.mockRejectedValue(new Error('Access Denied'))
    await expect(api.uploadToS3({}, 'v1/api/answerFormatter/matchTable.v2.json'))
      .rejects.toThrow('Failed to upload v1/api/answerFormatter/matchTable.v2.json: Access Denied')
  })

  it('回應不是 200 時拋錯', async () => {
    send.mockResolvedValue({ $metadata: { httpStatusCode: 500 } })
    await expect(api.uploadToS3({}, 'v1/api/answerFormatter/matchTable.json'))
      .rejects.toThrow('Failed to upload v1/api/answerFormatter/matchTable.json: HTTP 500')
  })

  it('成功時回傳結果與網址', async () => {
    send.mockResolvedValue({ $metadata: { httpStatusCode: 200 } })
    const result = await api.uploadToS3({}, 'v1/api/answerFormatter/matchTable.json')
    expect(result.Location).toMatch(/\/v1\/api\/answerFormatter\/matchTable\.json$/)
  })
})

const logger = require('../scripts/libs/logger')

describe('job log 帶 severity（kb-1005827）', () => {
  afterEach(() => jest.restoreAllMocks())

  it('一筆紀錄輸出一行 JSON，帶 severity、message 與附加欄位', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {})
    logger.notice('Match table change: 少了一列\n第二行', { updateTime: 1 })
    logger.warning('提醒')
    expect(log.mock.calls.map(([line]) => JSON.parse(line))).toEqual([
      { severity: 'NOTICE', message: 'Match table change: 少了一列\n第二行', updateTime: 1 },
      { severity: 'WARNING', message: '提醒' }
    ])
  })
})

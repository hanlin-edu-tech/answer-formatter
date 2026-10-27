// msGoogleDoc 代理在 Google Sheets API 超過每分鐘讀取配額時，仍回 HTTP 200，
// body 是 { message: '<HttpError 429 ...>' } 而不是表格陣列。只看狀態碼會把錯誤
// 物件當成表格往下傳，排程在 __buildMatchTable 崩潰。
// 配額每分鐘重置，重試間隔累計要超過一分鐘才撐得過同一個配額窗口。
const RETRY_DELAYS = [5000, 10000, 20000, 30000]

const __delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const __describe = (data) => {
  const text = typeof data === 'string' ? data : JSON.stringify(data)
  return (text || '').slice(0, 200)
}

/**
 * @description 抓取試算表分頁，回傳二維陣列；重試用盡仍拿不到陣列時拋錯，避免排程上傳缺了分頁的表。
 * @param {(url: string) => Promise<{ status: number, data: any }>} get - 例：axios.get
 * @param {string} url
 * @param {object} [options]
 * @param {number[]} [options.delays] - 每次重試前的等待毫秒數，長度即重試次數
 * @returns {Promise<string[][]>}
 */
const fetchSheetWithRetry = async (get, url, { delays = RETRY_DELAYS } = {}) => {
  let lastReason = ''
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (attempt > 0) {
      await __delay(delays[attempt - 1])
    }
    try {
      const res = await get(url)
      if (res.status === 200 && Array.isArray(res.data)) {
        return res.data
      }
      lastReason = `HTTP ${res.status}, body: ${__describe(res.data)}`
    } catch (err) {
      lastReason = err.message
    }
    console.error(`Fetch sheet failed (${attempt + 1}/${delays.length + 1}): ${lastReason}`)
  }
  throw new Error(`Failed to fetch sheet after ${delays.length + 1} attempts: ${url} (${lastReason})`)
}

module.exports = { RETRY_DELAYS, fetchSheetWithRetry }

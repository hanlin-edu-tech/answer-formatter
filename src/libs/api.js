const config = require('./config.js')
const fetcher = require('../utils/fetcher.js')

const {
  MATCH_TABLE_PATH,
  ITEMBANK_ITEM_S3_ENDPOINT,
  BACKEND_ENDPOINT
} = config.getConfig()

const api = {
  /**
   * @description 從 S3 取得同義詞匹配表。
   * @param {object} options
   * @param {string} options.endpoint - 可選的 S3 端點覆寫。
   * @returns {Promise<object>} 同義詞匹配表 JSON 物件。
   */
  async getMatchTable(options = {}) {
    const { endpoint } = options
    const MATCH_TABLE_URL = `${endpoint || ITEMBANK_ITEM_S3_ENDPOINT}/${MATCH_TABLE_PATH}`
    return await fetcher.get(MATCH_TABLE_URL)
  },

  /**
   * @description 透過後端代理服務進行語義判斷。
   * @param {string} answer1
   * @param {string} answer2
   * @returns {Promise<boolean>} 如果語義上等價，則解析為 true，否則為 false。
   */
  async judgeByLLM(answer1, answer2) {
    if (!BACKEND_ENDPOINT) {
      console.error('Backend endpoint is not configured.')
      return false
    }

    const PROXY_URL = `${BACKEND_ENDPOINT}/judge-answer`
    const requestBody = { answer1, answer2 }

    try {
      const data = await fetcher.post(PROXY_URL, requestBody)
      if (data && data.success) {
        return data.isEquivalent
      }
      return false
    } catch (error) {
      // 錯誤已在 fetcher.post 中被記錄
      return false
    }
  }
}

module.exports = api

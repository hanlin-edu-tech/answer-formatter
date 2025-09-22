const config = require('./config.js')
const fetcher = require('../utils/fetcher.js')

const MATCH_TABLE_PATH = config.getConfigByKey('MATCH_TABLE_PATH')
const ITEMBANK_ITEM_S3_ENDPOINT = config.getConfigByKey('ITEMBANK_ITEM_S3_ENDPOINT')

const api = {
  async getMatchTable(options = {}) {
    const { endpoint } = options
    const MATCH_TABLE_URL = `${endpoint || ITEMBANK_ITEM_S3_ENDPOINT}/${MATCH_TABLE_PATH}`
    return await fetcher.get(MATCH_TABLE_URL)
  }
}

module.exports = api

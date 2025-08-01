const config = require('./config.js')
const fetcher = require('../utils/fetcher.js')

const MATCH_TABLE_URL = config.getConfigByKey('ITEMBANK_ITEM_S3_ENDPOINT')

const api = {
  async getMatchTable() {
    return await fetcher.get(MATCH_TABLE_URL)
  }
}

module.exports = api

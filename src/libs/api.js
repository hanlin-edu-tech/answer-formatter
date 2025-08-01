const config = require('./config.js')
const fetcher = require('../utils/fetcher.js')

const MATCH_TABLE_URL = config.getConfigByKey('MATCH_TABLE_URL')

const api = {
  async getMatchTable() {
    return await fetcher.get(MATCH_TABLE_URL)
  }
}

module.exports = api

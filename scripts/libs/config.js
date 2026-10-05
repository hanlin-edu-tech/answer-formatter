require('dotenv').config()

const generalConfig = {
  AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
  AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
  FORMAT_RULE_SHEET_KEY: process.env.FORMAT_RULE_SHEET_KEY || '1SQEthOG0DqeFwgo_lyfEm10n-uUdx_bKKpk-TLQFC2k',
  FORMAT_RULE_SHEET_GID_PARTIAL_MATCH: process.env.FORMAT_RULE_SHEET_GID_PARTIAL_MATCH || '118514224',
  FORMAT_RULE_SHEET_GID_FULL_MATCH: process.env.FORMAT_RULE_SHEET_GID_FULL_MATCH || '2058290525',
  // variantMatch 分頁建立後填入 gid；未設定時 matchTable.v2.json 的 variantMatch 為空陣列，
  // SDK 會沿用內建表的 variantMatch
  FORMAT_RULE_SHEET_GID_VARIANT_MATCH: process.env.FORMAT_RULE_SHEET_GID_VARIANT_MATCH || '',
  // 分科規則：JSON 字串，科目代碼對應各層分頁 gid，分頁格式與全科通用分頁相同。
  // 例：{"E-EN":{"fullMatch":"123","partialMatch":"456"}}
  // 未設定時 matchTable.v2.json 不含 subjects，SDK 只套全科通用規則
  FORMAT_RULE_SHEET_SUBJECTS: process.env.FORMAT_RULE_SHEET_SUBJECTS || '{}',
  // 「科目設定」分頁（各科套用哪些 formatter，見 libs/formatterSettings.js）建立後填入 gid；
  // 未設定時 matchTable.v2.json 不含 formatter 開關，SDK 全照程式預設
  FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS: process.env.FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS || '',
  PORT: parseInt(process.env.PORT) || 8080,
  GEMINI_API_URL: process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'GEMINI_API_KEY'
}

const AWS_S3_BUCKET_TEST = process.env.AWS_S3_BUCKET_TEST || 'tw-itembank-sandbox'
const AWS_S3_REGION_TEST = process.env.AWS_S3_REGION_TEST || 'ap-east-2'
const AWS_S3_BUCKET_PROD = process.env.AWS_S3_BUCKET_PROD || 'tw-itembank'
const AWS_S3_REGION_PROD = process.env.AWS_S3_REGION_PROD || 'ap-east-2'

const testConfig = {
  MODE: 'TEST',
  AWS_S3_BUCKET: AWS_S3_BUCKET_TEST,
  AWS_S3_REGION: AWS_S3_REGION_TEST,
  CLOUD_FRONT_DISTRIBUTION_ID: process.env.CLOUD_FRONT_DISTRIBUTION_ID_TEST ? process.env.CLOUD_FRONT_DISTRIBUTION_ID_TEST.split(',') : []
}
const prodConfig = {
  MODE: 'PROD',
  AWS_S3_BUCKET: AWS_S3_BUCKET_PROD,
  AWS_S3_REGION: AWS_S3_REGION_PROD,
  CLOUD_FRONT_DISTRIBUTION_ID: process.env.CLOUD_FRONT_DISTRIBUTION_ID_PROD ? process.env.CLOUD_FRONT_DISTRIBUTION_ID_PROD.split(',') : ['E3UNW018IINPLB', 'E1F7BTSG5CGTT9']
}
const configMap = {
  test: testConfig,
  prod: prodConfig
}

const getConfig = () => {
  const modeMap = {
    測試: 'test',
    正式: 'prod'
  }
  const mode = process.env.MODE || modeMap[process.argv[3]] || 'test'
  const config = { ...generalConfig, ...configMap[mode] }
  return config
}

module.exports = { getConfig }

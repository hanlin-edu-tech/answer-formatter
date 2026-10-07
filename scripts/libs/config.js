require('dotenv').config()

const generalConfig = {
  AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
  AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
  FORMAT_RULE_SHEET_KEY: process.env.FORMAT_RULE_SHEET_KEY || '1SQEthOG0DqeFwgo_lyfEm10n-uUdx_bKKpk-TLQFC2k',
  // 完整／部分答案對答分頁（逐列勾選科目的新格式，見 libs/matchSheet.js）
  FORMAT_RULE_SHEET_GID_PARTIAL_MATCH: process.env.FORMAT_RULE_SHEET_GID_PARTIAL_MATCH || '1563505194',
  FORMAT_RULE_SHEET_GID_FULL_MATCH: process.env.FORMAT_RULE_SHEET_GID_FULL_MATCH || '288557978',
  // 「寫法統一」分頁（variantMatch）；分頁沒有規則時 matchTable.v2.json 的 variantMatch 為空陣列，
  // SDK 會沿用內建表的 variantMatch
  FORMAT_RULE_SHEET_GID_VARIANT_MATCH: process.env.FORMAT_RULE_SHEET_GID_VARIANT_MATCH || '547716751',
  // 「設定表」分頁（各科套用哪些 formatter，見 libs/formatterSettings.js）。
  FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS: process.env.FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS || '470764885',
  // 「規則表」分頁（各規則的範例，見 libs/ruleExamples.js）的 gid；job 上傳前用 S3 上的 SDK
  // （latest）檢查範例，不符就失敗不上傳。
  FORMAT_RULE_SHEET_GID_RULE_EXAMPLES: process.env.FORMAT_RULE_SHEET_GID_RULE_EXAMPLES || '641679514',
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

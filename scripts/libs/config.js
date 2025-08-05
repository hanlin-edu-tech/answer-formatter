require('dotenv').config()

const generalConfig = {
  AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
  AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
  FORMAT_RULE_SHEET_KEY: process.env.FORMAT_RULE_SHEET_KEY || '1SQEthOG0DqeFwgo_lyfEm10n-uUdx_bKKpk-TLQFC2k',
  FORMAT_RULE_SHEET_GID_PARTIAL_MATCH: process.env.FORMAT_RULE_SHEET_GID_PARTIAL_MATCH || '118514224',
  FORMAT_RULE_SHEET_GID_FULL_MATCH: process.env.FORMAT_RULE_SHEET_GID_FULL_MATCH || '2058290525',
  PORT: parseInt(process.env.PORT) || 8080
}

const AWS_S3_BUCKET_TEST = process.env.AWS_S3_BUCKET_TEST || 'tw-itembank-sandbox'
const AWS_S3_REGION_TEST = process.env.AWS_S3_REGION_TEST || 'ap-east-2'
const AWS_S3_BUCKET_PROD = process.env.AWS_S3_BUCKET_PROD || 'itembank'
const AWS_S3_REGION_PROD = process.env.AWS_S3_REGION_PROD || 'ap-southeast-1'

const testConfig = {
  MODE: 'TEST',
  AWS_S3_BUCKET: AWS_S3_BUCKET_TEST,
  AWS_S3_REGION: AWS_S3_REGION_TEST
}
const prodConfig = {
  MODE: 'PROD',
  AWS_S3_BUCKET: AWS_S3_BUCKET_PROD,
  AWS_S3_REGION: AWS_S3_REGION_PROD
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

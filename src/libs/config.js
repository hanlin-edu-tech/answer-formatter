const mode = process.env.MODE || 'test'

const generalConfig = {
  VERSION: process.env.VERSION || 'none',
  API_NAMESPACE: 'answerFormatter',
}

const AWS_S3_BUCKET_TEST = process.env.AWS_S3_BUCKET_TEST || 'tw-itembank-sandbox'
const AWS_S3_REGION_TEST = process.env.AWS_S3_REGION_TEST || 'ap-east-2'
const AWS_S3_BUCKET_PROD = process.env.AWS_S3_BUCKET_PROD || 'itembank'
const AWS_S3_REGION_PROD = process.env.AWS_S3_REGION_PROD || 'ap-southeast-1'

const testConfig = {
  MODE: mode.toUpperCase(),
  MATCH_TABLE_URL: `https://${AWS_S3_BUCKET_TEST}.s3.${AWS_S3_REGION_TEST}.amazonaws.com/v1/api/answerFormatter/matchTable.json`
}
const prodConfig = {
  MODE: 'PROD',
  MATCH_TABLE_URL: `https://${AWS_S3_BUCKET_PROD}.s3.${AWS_S3_REGION_PROD}.amazonaws.com/v1/api/answerFormatter/matchTable.json`
}
const configMap = {
  dev: testConfig,
  test: testConfig,
  prod: prodConfig
}
const config = { ...generalConfig, ...configMap[mode] }

const getConfig = () => {
  return config
}
const getConfigByKey = (key) => {
  return config[key]
}

module.exports = { getConfig, getConfigByKey }

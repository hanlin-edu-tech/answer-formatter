const mode = process.env.MODE || 'test'

const generalConfig = {
  VERSION: process.env.VERSION || 'none',
  API_NAMESPACE: 'answerFormatter',
  MATCH_TABLE_PATH: 'v1/api/answerFormatter/matchTable.json',
  LLM_PROXY_ENDPOINT: '/' // Default for prod, assuming same domain
}

const AWS_S3_BUCKET_TEST = process.env.AWS_S3_BUCKET_TEST || 'tw-itembank-sandbox'
const AWS_S3_REGION_TEST = process.env.AWS_S3_REGION_TEST || 'ap-east-2'
const AWS_S3_BUCKET_PROD = process.env.AWS_S3_BUCKET_PROD || 'itembank'
const AWS_S3_REGION_PROD = process.env.AWS_S3_REGION_PROD || 'ap-southeast-1'

const devConfig = {
  MODE: mode.toUpperCase(),
  ITEMBANK_ITEM_S3_ENDPOINT: `https://${AWS_S3_BUCKET_TEST}.s3.${AWS_S3_REGION_TEST}.amazonaws.com`,
  ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT: `https://item.ehanlin.com.tw`,
  BACKEND_ENDPOINT: 'http://localhost:8080'
}
const testConfig = {
  MODE: mode.toUpperCase(),
  ITEMBANK_ITEM_S3_ENDPOINT: `https://${AWS_S3_BUCKET_TEST}.s3.${AWS_S3_REGION_TEST}.amazonaws.com`,
  ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT: `https://item.ehanlin.com.tw`,
  BACKEND_ENDPOINT: 'https://answer-formatter-script-184800465453.asia-east1.run.app'
}
const prodConfig = {
  MODE: 'PROD',
  ITEMBANK_ITEM_S3_ENDPOINT: `https://${AWS_S3_BUCKET_PROD}.s3.${AWS_S3_REGION_PROD}.amazonaws.com`,
  ITEMBANK_ITEM_CLOUDFRONT_ENDPOINT: `https://item.ehanlin.com.tw`,
  BACKEND_ENDPOINT: 'https://answer-formatter-script-613393819622.asia-east1.run.app'
}
const configMap = {
  dev: devConfig,
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

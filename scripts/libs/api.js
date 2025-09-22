const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { CloudFrontClient, CreateInvalidationCommand } = require('@aws-sdk/client-cloudfront')
const axios = require('axios')
const { getConfig } = require('./config')

const {
  AWS_ACCESS_KEY,
  AWS_SECRET_KEY,
  AWS_S3_BUCKET,
  AWS_S3_REGION,
  FORMAT_RULE_SHEET_KEY,
  FORMAT_RULE_SHEET_GID_PARTIAL_MATCH,
  FORMAT_RULE_SHEET_GID_FULL_MATCH,
  CLOUD_FRONT_DISTRIBUTION_ID
} = getConfig()

const __delay = (ms = 1000) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
const __fetchWithRetry = async (url) => {
  let retryCount = 5
  do {
    try {
      retryCount--
      const res = await axios.get(url)
      if (res.status === 200) {
        return res.data
      }
      throw Error()
    } catch (err) {
      console.error(`Fetch failed, retrying... (${retryCount} attempts left)`)
    }
    await __delay(3000)
  } while (retryCount)
  return null
}

const apis = {
  async getPartialMatchSheet() {
    const url = `https://www.ehanlin.com.tw/msGoogleDoc/Spreadsheet!download?key=${FORMAT_RULE_SHEET_KEY}&gid=${FORMAT_RULE_SHEET_GID_PARTIAL_MATCH}`
    return await __fetchWithRetry(url)
  },
  async getFullMatchSheet() {
    const url = `https://www.ehanlin.com.tw/msGoogleDoc/Spreadsheet!download?key=${FORMAT_RULE_SHEET_KEY}&gid=${FORMAT_RULE_SHEET_GID_FULL_MATCH}`
    return await __fetchWithRetry(url)
  },
  async uploadToS3(data = {}, path = '', options = {}) {
    try {
      const clientConfig = {
        region: options.region || AWS_S3_REGION,
        credentials: {
          accessKeyId: AWS_ACCESS_KEY,
          secretAccessKey: AWS_SECRET_KEY
        }
      }
      const s3 = new S3Client(clientConfig)

      const commandInput = {
        Bucket: options.bucket || AWS_S3_BUCKET,
        Key: path,
        Body: JSON.stringify(data),
        ContentType: 'application/json',
        ACL: 'public-read',
        CacheControl: 'no-cache'
      }
      const command = new PutObjectCommand(commandInput)

      const result = await s3.send(command)
      if (result.$metadata.httpStatusCode === 200) {
        result.Location = `https://${commandInput.Bucket}.s3.${clientConfig.region}.amazonaws.com/${commandInput.Key}`
        console.log('succesfully uploaded', result.Location)
        return result
      }
    } catch (err) {
      console.log(err)
    }
    return null
  },
  async clearCloudFront(targetPath = [], options = {}) {
    try {
      if (!CLOUD_FRONT_DISTRIBUTION_ID?.length) {
        console.log('No CloudFront distribution ID configured, skipping cache invalidation.')
        return
      }

      const clientConfig = {
        region: options.region || AWS_S3_REGION,
        apiVersion: '2020-05-31',
        credentials: {
          accessKeyId: AWS_ACCESS_KEY,
          secretAccessKey: AWS_SECRET_KEY
        }
      }
      const cloudFront = new CloudFrontClient(clientConfig)

      const commandInput = (DistributionId = '') => ({
        DistributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: targetPath.length,
            Items: targetPath
          },
          CallerReference: (new Date() * 1000).toString()
        }
      })
      for (const id of CLOUD_FRONT_DISTRIBUTION_ID) {
        const command = new CreateInvalidationCommand(commandInput(id))
        const result = await cloudFront.send(command)
        console.log('CloudFront invalidation created:', result.Invalidation.Id)
      }
    } catch (error) {
      console.error('Error clearing CloudFront cache:', error)
    }
  },
}

module.exports = apis

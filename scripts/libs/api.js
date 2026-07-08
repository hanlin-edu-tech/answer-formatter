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
  GEMINI_API_URL,
  GEMINI_API_KEY,
  CLOUD_FRONT_DISTRIBUTION_ID
} = getConfig()

// HTML stem -> 純文字。寬鬆 regex，不要求合法 HTML。輸出截斷到 maxLen。
const __stripStem = (stem, maxLen = 500) => {
  if (!stem) return ''
  let text = String(stem)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length > maxLen) text = text.slice(0, maxLen) + '…'
  return text
}

// 共用判斷 prompt。
//   - 不傳 stem -> 保留歷史 prompt（與生產 Gemini 行為一致，向後相容）。
//   - 傳 stem  -> 用增強 prompt，告知 LLM 題幹上下文與答題格式限制；
//                 解填代號/是否/部分詞語等先前漏判的案例。
const __buildJudgePrompt = (answer1, answer2, stem) => {
  if (stem) {
    const stemPlain = __stripStem(stem)
    return `題目：${stemPlain}\n\n標準答案：「${answer1}」\n學生作答：「${answer2}」\n\n請判斷學生作答是否可以視為正確。\n1. 你的回答只能是「是」或「否」，不要有任何其他解釋。\n2. 嚴格依照題目要求的作答格式：填代號就只能填代號、回是/否就只能回是/否、要求單位就必須帶單位；不可多寫無關修飾或缺少必要符號。\n3. 學生作答必須涵蓋標準答案的關鍵語意。若標準答案有限定詞或修飾語（例：「人性」尊嚴、「國際」貿易），需依題目上下文判斷該限定詞是否關鍵：若題目空格前後已重複該限定詞使語意明確，學生可省略；否則不視為等價。\n4. 拼寫差異、異體字、同義詞、單位等價表達（如攝氏/°C、毫升/ml）、標點與空白差異，視為等價。`
  }
  return `這是一道問答題，標準答案是：「${answer1}」。有位學生回答：「${answer2}」。請根據以下規則回答這個問題：學生的回答是否可以視為正確？\n1. 你的回答只能是「是」或「否」，不要有任何其他解釋。\n2. 不只比較字面意思，亦需檢查實際語境下的意涵是否相符。`
}

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

const __judgeByGemini = async (answer1, answer2, stem) => {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'GEMINI_API_KEY') {
    throw new Error('Gemini API key is not configured on the server.')
  }
  const prompt = __buildJudgePrompt(answer1, answer2, stem)
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 5 }
  }
  try {
    const response = await axios.post(GEMINI_API_URL, requestBody, { headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' } })
    const data = response.data
    const llmAnswer = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    console.log(`[LLM Gemini] Judged "${answer2}" vs "${answer1}". Response: "${llmAnswer}"`)
    return llmAnswer === '是'
  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.error('Gemini API rate limit exceeded.');
      // 拋出一個帶有狀態碼的自訂錯誤物件
      throw { status: 429, message: 'Gemini API rate limit exceeded.' };
    }
    // 對於其他錯誤，重新拋出
    console.error('An error occurred during the Gemini API call:', error.message);
    throw error;
  }
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
  async judgeByLLM(answer1, answer2, stem) {
    return __judgeByGemini(answer1, answer2, stem)
  }
}

module.exports = apis

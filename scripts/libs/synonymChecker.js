const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { getConfig } = require('./config')
const config = getConfig()

const IS_DEV_MODE = config.MODE === 'DEV'
const LIMIT_COUNT_USER_QUESTION = 100
const TEST_RESULTS_DIR = './test_results'
const TEST_RESULTS_FILE = path.join(TEST_RESULTS_DIR, 'synonyms.json')

// 初始化 AWS S3、MongoDB 和 Gemini 客戶端
const s3Client = new S3Client({
  region: config.AWS_S3_REGION,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY,
    secretAccessKey: config.AWS_SECRET_KEY
  }
})
const mongoClient = new MongoClient(config.MONGO_URI)
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY)
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

/**
 * 將文字流轉換為字串
 * @param {ReadableStream} stream - 從 S3 GetObjectCommand 回傳的 Body
 * @returns {Promise<string>}
 */
const streamToString = (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

/**
 * 主要的 cronjob 工作函數
 */
const checkSynonyms = async () => {
  console.log('Running synonym check task at:', new Date().toISOString())
  try {
    await mongoClient.connect()
    console.log('MongoDB connected successfully.')

    if (IS_DEV_MODE) {
      if (!fs.existsSync(TEST_RESULTS_DIR)) {
        fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true })
        console.log(`Created test results directory: ${TEST_RESULTS_DIR}`)
      }
    }

    const database = mongoClient.db(config.MONGO_DB_NAME)
    const userQuestionCollection = database.collection('UserQuestion')

    // 從 Mongo DB 讀取最新幾筆 corrected 為 false 的記錄
    const userQuestions = await userQuestionCollection
      .find({ corrected: { $ne: true } }) // 使用 $ne: true 來包含 corrected: false 和不存在 corrected 欄位的記錄
      .sort({ _id: -1 }) // 根據 ObjectId 排序以取得最新記錄
      .limit(LIMIT_COUNT_USER_QUESTION)
      .toArray()

    if (userQuestions.length === 0) {
      console.log('No new user questions to process.')
      return
    }

    console.log(`Found ${userQuestions.length} userQuestion(s) to process.`)

    for (const userQuestion of userQuestions) {
      try {
        const { _id, question: itemId, index: questionIndex, answer } = userQuestion

        // 1. 檢查資料格式
        if (!itemId || typeof questionIndex !== 'number' || !Array.isArray(answer)) {
          console.log(`[${_id}] Skipping: Invalid data format`)
          continue
        }

        // 2. 根據 question 欄位的 itemId，從 S3 取得題目 item.json
        const getObjectParams = {
          Bucket: config.AWS_S3_BUCKET,
          Key: `v1/items/${itemId}/item.json`
        }
        const s3Object = await s3Client.send(new GetObjectCommand(getObjectParams))
        const itemJsonString = await streamToString(s3Object.Body)
        const item = JSON.parse(itemJsonString)

        // 3. 使用 questionIndex 找到對應的子題 metadata 和 content
        const subQuestionMetadata = item.questions?.find(q => q.questionIndex === questionIndex)
        const subQuestionContent = item.content?.questions?.[questionIndex]

        if (!subQuestionMetadata || !subQuestionContent) {
          console.log(`[${_id}] Skipping: Cannot find sub-question with index ${questionIndex} in item.json.`)
          continue
        }

        // 4. 根據子題的題型，判斷是否要處理
        const supportedTypes = ['填充題', '問答題']
        const answeringMethod = subQuestionMetadata.answeringMethod
        
        if (!answeringMethod || !supportedTypes.includes(answeringMethod)) {
          console.log(`[${_id}] Skipping: Sub-question type "${answeringMethod}" is not supported.`)
          continue
        }

        // 5. 遍歷該子題的「各個答案格」
        const correctAnswersForBlanks = subQuestionContent.answers
        if (!Array.isArray(correctAnswersForBlanks)) {
          console.log(`[${_id}] Skipping: Correct answers for sub-question ${questionIndex} is not an array.`)
          await userQuestionCollection.updateOne({ _id }, { $set: { corrected: true, error: 'Correct answers format error' } })
          continue
        }

        for (let i = 0; i < answer.length; i++) {
          const userAnswerValue = answer[i]?.[0]
          const correctAnswerValue = correctAnswersForBlanks[i]?.[0] // 取該答案格的第一個正確答案

          if (!userAnswerValue || !correctAnswerValue) {
            console.log(`[${_id}] Skipping: Blank ${i} in sub-question ${questionIndex} is missing answer.`)
            continue
          }

          // 6. 將用戶答案及正確答案傳給 Gemini 判斷是否為同義詞
          const prompt = `請判斷以下兩個答案是否為同義詞。
          正確答案: ${correctAnswerValue}
          用戶答案: ${userAnswerValue}
          如果它們的意思相同或非常接近，請只回答 true。
          如果它們的意思不同，請只回答 false。`

          const result = await geminiModel.generateContent(prompt)
          const response = await result.response
          const isSynonym = response.text().trim().toLowerCase() === 'true'

          // 7. 若是，則儲存結果
          if (isSynonym) {
            console.log(`[${_id}] Blank ${i}: Answer "${userAnswerValue}" is a synonym for "${correctAnswerValue}". Storing result.`)
            if (IS_DEV_MODE) {
              const testResult = {
                _id: _id.toString(), // Convert ObjectId to string for JSON storage
                itemId,
                questionIndex,
                blankIndex: i,
                userAnswer: userAnswerValue,
                correctAnswer: correctAnswerValue,
                isSynonym: true,
                timestamp: new Date().toISOString()
              }
              fs.appendFileSync(TEST_RESULTS_FILE, JSON.stringify(testResult) + '\n')
            }
          } else {
            console.log(`[${_id}] Blank ${i}: Answer "${userAnswerValue}" is NOT a synonym for "${correctAnswerValue}".`)
          }
        }
      } catch (err) {
        console.error(`Failed to process question ${userQuestion._id}:`, err)
      }
    }

  } catch (err) {
    console.error('An error occurred during the cronjob execution:', err)
  } finally {
    await mongoClient.close()
    console.log('MongoDB connection closed.')
  }
}

checkSynonyms()

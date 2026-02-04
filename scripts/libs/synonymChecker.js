const { MongoClient, ObjectId } = require('mongodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { getConfig } = require('./config')
const config = getConfig()

// --- 設定常數 ---
const TARGET_SUBJECT_IDS = ['J-NA', 'J-BI', 'J-PY', 'J-EA', 'J-SO', 'J-GE', 'J-HI', 'J-CT', 'H-NA', 'H-BI', 'H-PH', 'H-CE', 'H-EA', 'H-SO', 'H-GE', 'H-HI', 'H-CS']
const QUERY_CHUNK_SIZE = 10000 // 一次從 DB 撈取的筆數
const AI_BATCH_SIZE = 100 // 一次發給 AI 的任務數量
const MAIN_DB_NAME = 'nu_ehanlin'
const QUESTION_COLLECTION_NAME = 'UserQuestion'
const SYNONYM_COLLECTION_NAME = 'SynonymAnswers'
const STATE_DB_NAME = 'answer-formatter'
const STATE_COLLECTION_NAME = 'ProcessingState'
const SERVICE_NAME = 'synonymChecker'
const MAX_LOCAL_RUNS = 1
const IS_LOCAL_TEST = config.MODE === 'DEV'

// --- 初始化客戶端 ---
const s3Client = new S3Client({
  region: config.AWS_S3_REGION,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY,
    secretAccessKey: config.AWS_SECRET_KEY
  }
})
const mongoClientProd = new MongoClient(config.MONGO_URI_PROD)
const mongoClientTest = new MongoClient(config.MONGO_URI_TEST)
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY)
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })

const batchCheckSynonymsWithAI = async (tasks) => {
  const prompt = `你是一位同義詞判斷專家。以下是一個 JSON 陣列，其中包含多組「正確答案」和「用戶答案」的配對。對於陣列中的每個物件，請判斷「用戶答案」是否為「正確答案」的同義詞。
  請回傳一個與輸入陣列長度完全相同的 JSON 布林值陣列。每個索引處的布林值必須與相同索引處的輸入物件相對應。
  輸入:
  ${JSON.stringify(tasks, null, 2)}`

  try {
    const result = await geminiModel.generateContent(prompt)
    const responseText = result.response.text().trim()
    const cleanedJson = responseText.replace(/^```json\n/, '').replace(/\n```$/, '')
    const results = JSON.parse(cleanedJson)
    if (Array.isArray(results) && results.length === tasks.length) {
      return results
    }
    throw new Error('AI response format is invalid.')
  } catch (err) {
    console.error('Error during AI batch processing:', err)
    return new Array(tasks.length).fill(false)
  }
}

const processBatch = async (mongoClientProd, mongoClientTest) => {
  console.log('Running synonym check batch task at:', new Date().toISOString())
  let lastIdInChunk = null

  try {
    const mainDb = mongoClientProd.db(MAIN_DB_NAME)
    const stateDb = mongoClientTest.db(STATE_DB_NAME)
    const userQuestionCollection = mainDb.collection(QUESTION_COLLECTION_NAME)
    const stateCollection = stateDb.collection(STATE_COLLECTION_NAME)
    const synonymCollection = stateDb.collection(SYNONYM_COLLECTION_NAME)

    const state = await stateCollection.findOne({ serviceName: SERVICE_NAME })
    const lastProcessedId = state ? state.lastProcessedId : new ObjectId('000000000000000000000000')
    console.log(`Starting process from after _id: ${lastProcessedId}`)

    // 1. 從 DB 撈取一個固定大小的 chunk
    const userQuestions = await userQuestionCollection
      .find({ _id: { $gt: lastProcessedId }, corrected: { $ne: true } })
      .sort({ _id: 1 })
      .limit(QUERY_CHUNK_SIZE)
      .toArray()

    if (userQuestions.length === 0) {
      console.log('No new user questions to process. Exiting.')
      return false // 回傳 false 表示沒有更多資料
    }

    // 無論如何，處理視窗都將推進到這個 chunk 的結尾
    lastIdInChunk = userQuestions[userQuestions.length - 1]._id
    console.log(`Fetched a chunk of ${userQuestions.length} documents. Last ID in chunk is ${lastIdInChunk}`)
    console.log('=========================================================')

    // 2. 在記憶體中過濾，收集所有有效的任務
    const allValidTasksInChunk = []
    for (const userQuestion of userQuestions) {
      const { _id, question: itemId, index: questionIndex, answer } = userQuestion
      if (!itemId || typeof questionIndex !== 'number' || !Array.isArray(answer)) continue

      try {
        const getObjectParams = { Bucket: config.AWS_S3_BUCKET, Key: `v1/items/${itemId}/item.json` }
        const s3Object = await s3Client.send(new GetObjectCommand(getObjectParams))
        const item = JSON.parse(await streamToString(s3Object.Body))

        const subQuestionMetadata = item.questions?.find(q => q.questionIndex === questionIndex)

        const supportedTypes = ['填充題', '問答題']
        if (!subQuestionMetadata || !supportedTypes.includes(subQuestionMetadata.answeringMethod)) continue
        if (!TARGET_SUBJECT_IDS.some(id => item.subjectIds?.includes(id))) continue

        const subQuestionContent = item.content?.questions?.[questionIndex]
        const correctAnswersForBlanks = subQuestionContent?.answers

        if (Array.isArray(correctAnswersForBlanks)) {
          for (let i = 0; i < answer.length; i++) {
            const userAnswer = answer[i]?.[0]
            const correctAnswer = correctAnswersForBlanks[i]?.[0]
            if (userAnswer && correctAnswer) {
              allValidTasksInChunk.push({ userAnswer, correctAnswer })
            }
          }
        }
      } catch (filterErr) {
        console.error(`[${_id}] Error while filtering document, skipping:`, filterErr.message)
      }
    }

    // 5. 更新處理進度 (無論成功或失敗，只要有撈到資料就要更新)
    await stateCollection.updateOne(
      { serviceName: SERVICE_NAME },
      { $set: { lastProcessedId: lastIdInChunk, updatedAt: new Date() } },
      { upsert: true }
    )
    console.log(`Successfully updated state. New lastProcessedId is ${lastIdInChunk}`)

    if (allValidTasksInChunk.length === 0) {
      console.log('No valid tasks found in this chunk.')
      console.log('=========================================================')
      return true // 雖然沒有有效任務，但成功處理了一個 chunk，應繼續下一輪
    }

    console.log(`Collected ${allValidTasksInChunk.length} valid answer pairs from chunk.`)

    // 3. 將有效任務分批次送給 AI 處理
    for (let i = 0; i < allValidTasksInChunk.length; i += AI_BATCH_SIZE) {
      const batch = allValidTasksInChunk.slice(i, i + AI_BATCH_SIZE)
      console.log(`Processing AI batch of ${batch.length} tasks...`)

      const synonymResults = await batchCheckSynonymsWithAI(batch)

      // 4. 儲存結果
      let storedCount = 0
      for (let j = 0; j < batch.length; j++) {
        if (synonymResults[j]) {
          const task = batch[j]
          await synonymCollection.updateOne(
            { correctedAnswer: task.correctAnswer },
            { $addToSet: { userAnswers: task.userAnswer } },
            { upsert: true }
          )
          storedCount++
        }
      }
      console.log(`Stored ${storedCount} new synonym pairs from this AI batch.`)
    }

    console.log('=========================================================')
    return true // 成功處理，應繼續
  } catch (err) {
    console.error('An error occurred during the batch task execution:', err)
    return true // 即使出錯也應繼續下一輪，避免卡住
  }
}

const connect = async () => {
  await mongoClientProd.connect()
  await mongoClientTest.connect()
  console.log('MongoDB connected successfully.')
}
const cleanup = async () => {
  console.log('\nGracefully shutting down...')
  await mongoClientProd.close()
  await mongoClientTest.close()
  console.log('MongoDB connection closed.')
  process.exit(0)
}

const runOnce = async () => {
  try {
    await connect()
    await processBatch(mongoClientProd, mongoClientTest)
  } finally {
    await cleanup()
  }
}

const main = async () => {
  const sleep = (ms) => new Promise(res => setTimeout(res, ms))
  let runs = 0

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  try {
    await connect()
    
    // eslint-disable-next-line no-constant-condition
    while (MAX_LOCAL_RUNS === 0 || runs < MAX_LOCAL_RUNS) {
      console.log(`\n--- Local Run ${runs + 1} of ${MAX_LOCAL_RUNS === 0 ? 'infinite' : MAX_LOCAL_RUNS} ---`)
      const hasMoreData = await processBatch(mongoClientProd, mongoClientTest)
      // 如果 processBatch 回傳 false (表示已無新資料)，就跳出迴圈
      if (!hasMoreData) {
        console.log('Stopping continuous run as there are no more questions.')
        break
      }
      runs++
      if (MAX_LOCAL_RUNS !== 0 && runs >= MAX_LOCAL_RUNS) {
        console.log('\nFinished all scheduled local runs.')
        break
      }
      console.log('\nWaiting for 1 seconds before next run...')
      await sleep(1000)
    }
  } finally {
    await cleanup()
  }
}

if (IS_LOCAL_TEST) {
  console.log('Running in local continuous mode.')
  main()
} else {
  console.log('Running in single-run mode for production.')
  runOnce()
}

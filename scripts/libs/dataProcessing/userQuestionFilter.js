const { MongoClient, ObjectId } = require('mongodb')
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3')
const pLimit = require('p-limit')
const { getConfig } = require('../config')
const config = getConfig()

// --- 設定常數 ---
const QUERY_CHUNK_SIZE = 10000 // 一次從 DB 撈取的筆數
const MAIN_DB_NAME = 'nu_ehanlin'
const QUESTION_COLLECTION_NAME = 'UserQuestion'
const DESTINATION_DB_NAME = 'answer-formatter'
const DESTINATION_COLLECTION_NAME = 'UserQuestions' // 新的 Collection 名稱
const STATE_DB_NAME = 'answer-formatter'
const STATE_COLLECTION_NAME = 'ProcessingState'
const SERVICE_NAME = 'questionFilter' // 這個 script 的服務名稱
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

const streamToString = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = []
    stream.on('data', (chunk) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })

const normalizeText = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

const buildItemSolution = (item, subQuestionContent) => {
  const itemSolution = normalizeText(item?.solution)
  if (itemSolution) return itemSolution

  const subQuestionSolution = normalizeText(subQuestionContent?.solution)
  if (subQuestionSolution) return subQuestionSolution

  return null
}

const buildItemStem = (item, subQuestionContent) => {
  const parts = [
    normalizeText(item?.content?.preamble),
    normalizeText(subQuestionContent?.stem)
  ].filter(Boolean)

  if (parts.length === 0) return null
  return parts.join('\n\n')
}

const processBatch = async (mongoClientProd, mongoClientTest) => {
  console.log('Running question filter batch task at:', new Date().toISOString())
  let lastIdInChunk = null

  try {
    const mainDb = mongoClientProd.db(MAIN_DB_NAME)
    const stateDb = mongoClientTest.db(STATE_DB_NAME)
    const destinationDb = mongoClientTest.db(DESTINATION_DB_NAME)

    const userQuestionCollection = mainDb.collection(QUESTION_COLLECTION_NAME)
    const stateCollection = stateDb.collection(STATE_COLLECTION_NAME)
    const destinationCollection = destinationDb.collection(DESTINATION_COLLECTION_NAME)

    const state = await stateCollection.findOne({ serviceName: SERVICE_NAME })
    const lastProcessedId = state ? state.lastProcessedId : new ObjectId('000000000000000000000000')
    console.log(`Starting process from after _id: ${lastProcessedId}`)

    // 根據 _id (時間) 從 DB 撈取一個固定大小的 chunk
    const userQuestions = await userQuestionCollection
      .find({ _id: { $gt: lastProcessedId }, corrected: { $ne: true }, answer: { $exists: true, $ne: [] } })
      .sort({ _id: 1 })
      .limit(QUERY_CHUNK_SIZE)
      .toArray()

    if (userQuestions.length === 0) {
      console.log('No new user questions to process. Exiting.')
      return false // 回傳 false 表示沒有更多資料
    }

    lastIdInChunk = userQuestions[userQuestions.length - 1]._id
    console.log(`Fetched a chunk of ${userQuestions.length} documents. Last ID in chunk is ${lastIdInChunk}`)
    console.log('=========================================================')

    const itemCache = new Map()
    const limit = pLimit(50) // 限制同時 50 個 S3 請求

    const filteredQuestions = (await Promise.all(userQuestions.map(userQuestion => limit(async () => {
      const { _id, question: itemId, index: questionIndex, answer } = userQuestion
      if (!itemId || typeof questionIndex !== 'number') return null

      try {
        let itemPromise
        if (itemCache.has(itemId)) {
          itemPromise = itemCache.get(itemId)
        } else {
          itemPromise = (async () => {
            const getObjectParams = { Bucket: config.AWS_S3_BUCKET, Key: `v1/items/${itemId}/item.json` }
            const s3Object = await s3Client.send(new GetObjectCommand(getObjectParams))
            return JSON.parse(await streamToString(s3Object.Body))
          })()
          itemCache.set(itemId, itemPromise)
        }
        const item = await itemPromise

        const subQuestionMetadata = item.questions?.find(q => q.questionIndex === questionIndex)
        console.log(`[${_id}] itemId: ${itemId} / index: ${questionIndex} / answerMethod: ${subQuestionMetadata?.answeringMethod || 'none'}`)

        // 篩選出填充題和問答題
        const supportedTypes = ['填充題', '問答題']
        if (!subQuestionMetadata || !supportedTypes.includes(subQuestionMetadata.answeringMethod)) return null

        const subQuestionContent = item.content?.questions?.[questionIndex]

        userQuestion.answeringMethod = subQuestionMetadata.answeringMethod
        userQuestion.subjectIds = item.subjectIds
        userQuestion.itemAnswer = subQuestionContent?.proposeAnswers?.length > 0 ? subQuestionContent?.proposeAnswers : subQuestionContent?.answers
        const itemSolution = buildItemSolution(item, subQuestionContent)
        const itemStem = buildItemStem(item, subQuestionContent)
        if (itemSolution) userQuestion.itemSolution = itemSolution
        if (itemStem) userQuestion.itemStem = itemStem
        return (userQuestion.subjectIds && userQuestion.itemAnswer && answer) ? userQuestion : null
      } catch (filterErr) {
        console.error(`[${_id}] Error while filtering document, skipping:`, filterErr.message)
        return null
      }
    })))).filter(Boolean)

    // 將篩選後的資料存入新的 collection
    if (filteredQuestions.length > 0) {
      await destinationCollection.insertMany(filteredQuestions)
      console.log(`Successfully stored ${filteredQuestions.length} filtered questions.`)
    } else {
      console.log('No valid questions found in this chunk.')
    }

    // 更新處理進度
    await stateCollection.updateOne(
      { serviceName: SERVICE_NAME },
      { $set: { lastProcessedId: lastIdInChunk, updatedAt: new Date() } },
      { upsert: true }
    )
    console.log(`Successfully updated state. New lastProcessedId is ${lastIdInChunk}`)
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
  console.log('Gracefully shutting down...')
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
      console.log(`--- Local Run ${runs + 1} of ${MAX_LOCAL_RUNS === 0 ? 'infinite' : MAX_LOCAL_RUNS} ---`)
      const hasMoreData = await processBatch(mongoClientProd, mongoClientTest)
      if (!hasMoreData) {
        console.log('Stopping continuous run as there are no more questions.')
        break
      }
      runs++
      if (MAX_LOCAL_RUNS !== 0 && runs >= MAX_LOCAL_RUNS) {
        console.log('Finished all scheduled local runs.')
        break
      }
      console.log('Waiting for 1 seconds before next run...')
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

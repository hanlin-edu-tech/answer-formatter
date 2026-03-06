const { MongoClient, ObjectId } = require('mongodb')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { getConfig } = require('./config')
const config = getConfig()

// --- 設定常數 ---
const QUERY_CHUNK_SIZE = 10000 // 一次從 DB 撈取的筆數
const AI_BATCH_SIZE = 50 // 一次發給 AI 的任務數量
const QUESTION_COLLECTION_NAME = 'UserQuestions'
const SYNONYM_COLLECTION_NAME = 'SynonymAnswers'
const STATE_DB_NAME = 'answer-formatter'
const STATE_COLLECTION_NAME = 'ProcessingState'
const SERVICE_NAME = 'synonymChecker'
const MAX_LOCAL_RUNS = 1
const IS_LOCAL_TEST = config.MODE === 'DEV'

// --- 初始化客戶端 ---
const mongoClientProd = new MongoClient(config.MONGO_URI_PROD)
const mongoClientTest = new MongoClient(config.MONGO_URI_TEST)
const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY)
const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json' }
})

const batchCheckSynonymsWithAI = async (tasks) => {
  console.log(tasks)

  const prompt = `你是一位同義詞判斷專家。以下是一個 JSON 陣列，其中包含多組「正確答案」和「用戶答案」的配對。對於陣列中的每個物件，請判斷「用戶答案」是否為「正確答案」的同義詞。
  請回傳一個與輸入陣列長度完全相同的 JSON 布林值陣列。每個索引處的布林值必須與相同索引處的輸入物件相對應。
  輸入:
  ${JSON.stringify(tasks, null, 2)}`

  let responseText = ''
  try {
    const result = await geminiModel.generateContent(prompt)
    responseText = result.response.text().trim()

    // 移除可能的 Markdown 標籤並嘗試解析
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    const results = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText)

    if (Array.isArray(results) && results.length === tasks.length) {
      return results
    }

    console.error(`Invalid response length or format. Expected ${tasks.length}, got ${Array.isArray(results) ? results.length : 'non-array'}`)
    throw new Error('AI response format is invalid.')
  } catch (err) {
    console.error('Error during AI batch processing:', err)
    console.error('Raw AI Response:', responseText)
    throw err
  }
}

const processBatch = async (mongoClientProd, mongoClientTest) => {
  console.log('Running synonym check batch task at:', new Date().toISOString())
  let lastIdInChunk = null

  try {
    const stateDb = mongoClientTest.db(STATE_DB_NAME)
    const userQuestionCollection = stateDb.collection(QUESTION_COLLECTION_NAME)
    const stateCollection = stateDb.collection(STATE_COLLECTION_NAME)
    const synonymCollection = stateDb.collection(SYNONYM_COLLECTION_NAME)

    const state = await stateCollection.findOne({ serviceName: SERVICE_NAME })
    const lastProcessedId = state ? state.lastProcessedId : new ObjectId('000000000000000000000000')
    console.log(`Starting process from after _id: ${lastProcessedId}`)

    // 從 DB 撈取一個固定大小的 chunk
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

    // 在記憶體中過濾，收集所有有效的任務
    const allValidTasksInChunk = []
    for (const userQuestion of userQuestions) {
      const { _id, question: itemId, index: questionIndex, answer, itemAnswer } = userQuestion
      if (!itemId || typeof questionIndex !== 'number' || !Array.isArray(answer) || !Array.isArray(itemAnswer)) continue

      try {
        for (let i = 0; i < answer.length; i++) {
          const userAnswer = answer[i]?.[0]
          const correctAnswer = itemAnswer[i]?.[0]
          if (userAnswer && correctAnswer && userAnswer !== correctAnswer) {
            allValidTasksInChunk.push({ userAnswer, correctAnswer, sourceId: _id })
          }
        }
      } catch (filterErr) {
        console.error(`[${_id}] Error while filtering document, skipping:`, filterErr.message)
      }
    }

    if (allValidTasksInChunk.length === 0) {
      console.log('No valid tasks found in this chunk.')
      await stateCollection.updateOne(
        { serviceName: SERVICE_NAME },
        { $set: { lastProcessedId: lastIdInChunk, updatedAt: new Date() } },
        { upsert: true }
      )
      console.log(`Successfully updated state to ${lastIdInChunk}`)
      console.log('=========================================================')
      return true
    }

    console.log(`Collected ${allValidTasksInChunk.length} valid answer pairs from chunk.`)

    // 將有效任務分批次送給 AI 處理
    for (let i = 0; i < allValidTasksInChunk.length; i += AI_BATCH_SIZE) {
      const batch = allValidTasksInChunk.slice(i, i + AI_BATCH_SIZE)
      console.log(`Processing AI batch of ${batch.length} tasks...`)

      const aiTasks = batch.map(({ userAnswer, correctAnswer }) => ({ userAnswer, correctAnswer }))
      let synonymResults
      try {
        synonymResults = await batchCheckSynonymsWithAI(aiTasks)
      } catch (aiErr) {
        console.error('AI Processing failed, stopping batch to preserve state:', aiErr.message)
        return false // 發生 AI 錯誤時中斷，不更新此批次的進度
      }

      // 儲存結果
      let storedCount = 0
      for (let j = 0; j < batch.length; j++) {
        if (synonymResults[j]) {
          const { userAnswer, correctAnswer } = batch[j]
          await synonymCollection.updateOne(
            { correctedAnswer: correctAnswer },
            { $addToSet: { userAnswers: userAnswer } },
            { upsert: true }
          )
          storedCount++
        }
      }
      
      // 此批次處理完，立即更新進度到該批次最後一個任務的 sourceId
      const batchLastId = batch[batch.length - 1].sourceId
      await stateCollection.updateOne(
        { serviceName: SERVICE_NAME },
        { $set: { lastProcessedId: batchLastId, updatedAt: new Date() } },
        { upsert: true }
      )
      console.log(`Stored ${storedCount} pairs. Updated state to sourceId: ${batchLastId}`)
    }

    // 整個大 Chunk 結束後，確保進度推到該 Chunk 的最後一個 ID
    await stateCollection.updateOne(
      { serviceName: SERVICE_NAME },
      { $set: { lastProcessedId: lastIdInChunk, updatedAt: new Date() } },
      { upsert: true }
    )
    console.log(`Chunk fully processed. Final state updated to: ${lastIdInChunk}`)
    console.log('=========================================================')
    return true // 成功處理，應繼續
  } catch (err) {
    console.error('An error occurred during the batch task execution:', err)
    return false
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
      // 如果 processBatch 回傳 false (表示已無新資料或發生錯誤)，就跳出迴圈
      if (!hasMoreData) {
        console.log('Stopping continuous run as there are no more questions or an error occurred.')
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

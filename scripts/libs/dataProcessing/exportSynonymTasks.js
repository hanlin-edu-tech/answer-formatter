const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const { MongoClient, ObjectId } = require('mongodb')
const { getConfig } = require('../config')

const config = getConfig()

const DB_NAME = 'answer-formatter'
const COLLECTION_NAME = 'UserQuestions'
const DEFAULT_DOCUMENT_BATCH_SIZE = 10000
const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), 'tmp', 'synonym-tasks.ndjson')

const normalizeAnswer = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/\s+/g, ' ')
}

const shouldSkipPair = (userAnswer, correctAnswer) => {
  if (!userAnswer || !correctAnswer) return true
  if (userAnswer === correctAnswer) return true
  if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) return true
  return false
}

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    limit: 0,
    batchSize: DEFAULT_DOCUMENT_BATCH_SIZE,
    output: DEFAULT_OUTPUT_PATH,
    afterId: null
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--limit' && args[i + 1]) {
      options.limit = Number.parseInt(args[i + 1], 10)
      i++
      continue
    }
    if (arg === '--batch-size' && args[i + 1]) {
      options.batchSize = Number.parseInt(args[i + 1], 10)
      i++
      continue
    }
    if (arg === '--output' && args[i + 1]) {
      options.output = path.resolve(process.cwd(), args[i + 1])
      i++
      continue
    }
    if (arg === '--after-id' && args[i + 1]) {
      options.afterId = args[i + 1]
      i++
    }
  }

  if (!Number.isInteger(options.limit) || options.limit < 0) {
    throw new Error('`--limit` must be a non-negative integer.')
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize <= 0) {
    throw new Error('`--batch-size` must be a positive integer.')
  }

  if (options.afterId && !ObjectId.isValid(options.afterId)) {
    throw new Error('`--after-id` must be a valid Mongo ObjectId.')
  }

  return options
}

const createTask = (doc, answerIndex) => {
  const answers = Array.isArray(doc.answer) ? doc.answer : []
  const itemAnswers = Array.isArray(doc.itemAnswer) ? doc.itemAnswer : []
  const userAnswer = normalizeAnswer(answers[answerIndex]?.[0])
  const correctAnswer = normalizeAnswer(itemAnswers[answerIndex]?.[0])

  if (shouldSkipPair(userAnswer, correctAnswer)) return null

  return {
    sourceId: String(doc._id),
    itemId: doc.question || null,
    questionIndex: typeof doc.index === 'number' ? doc.index : null,
    answerIndex,
    correctAnswer,
    userAnswer
  }
}

const main = async () => {
  const { limit, batchSize, output, afterId } = parseArgs()
  const mongoClient = new MongoClient(config.MONGO_URI_TEST)
  let outputStream

  try {
    await mongoClient.connect()
    await fsp.mkdir(path.dirname(output), { recursive: true })
    outputStream = fs.createWriteStream(output, { encoding: 'utf8' })

    const collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME)
    const query = { corrected: { $ne: true } }

    if (afterId) {
      query._id = { $gt: new ObjectId(afterId) }
    }

    const cursor = collection.find(query).sort({ _id: 1 }).batchSize(batchSize)

    let processedDocuments = 0
    let writtenTasks = 0
    let lastSourceId = null

    for await (const doc of cursor) {
      processedDocuments++
      lastSourceId = String(doc._id)

      const answers = Array.isArray(doc.answer) ? doc.answer : []
      for (let i = 0; i < answers.length; i++) {
        const task = createTask(doc, i)
        if (!task) continue
        outputStream.write(`${JSON.stringify(task)}\n`)
        writtenTasks++
      }

      if (processedDocuments % batchSize === 0) {
        console.log(`Processed ${processedDocuments} documents, wrote ${writtenTasks} tasks. Last _id: ${lastSourceId}`)
      }

      if (limit > 0 && processedDocuments >= limit) {
        break
      }
    }

    await new Promise((resolve, reject) => {
      outputStream.end((error) => {
        if (error) reject(error)
        else resolve()
      })
    })

    const summary = {
      documentsProcessed: processedDocuments,
      tasksWritten: writtenTasks,
      lastSourceId,
      output
    }
    await fsp.writeFile(`${output}.summary.json`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

    console.log(JSON.stringify(summary, null, 2))
  } finally {
    if (outputStream && !outputStream.closed) {
      outputStream.destroy()
    }
    await mongoClient.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

const fs = require('fs/promises')
const path = require('path')
const { MongoClient, ObjectId } = require('mongodb')
const { getConfig } = require('../config')

const config = getConfig()

const DEFAULT_INPUT = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full', 'review-unique-pairs-top1000.json')
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full', 'review-pair-decisions-top1000-context.json')
const DB_NAME = 'answer-formatter'
const COLLECTION_NAME = 'UserQuestions'

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' && args[i + 1]) {
      options.input = path.resolve(process.cwd(), args[i + 1])
      i++
      continue
    }
    if (arg === '--output' && args[i + 1]) {
      options.output = path.resolve(process.cwd(), args[i + 1])
      i++
    }
  }

  return options
}

const normalizeDecisions = (payload) => {
  if (Array.isArray(payload.decisions)) {
    return payload.decisions
  }

  if (Array.isArray(payload.candidates)) {
    return payload.candidates.map((candidate) => ({
      id: candidate.id,
      correctAnswer: candidate.correctAnswer,
      userAnswer: candidate.userAnswer,
      count: candidate.count,
      examples: candidate.examples || []
    }))
  }

  throw new Error('Input payload must include either `decisions` or `candidates`.')
}

const toObjectId = (value) => {
  try {
    return new ObjectId(value)
  } catch {
    return null
  }
}

const pickContext = (doc) => ({
  sourceId: doc._id.toString(),
  itemId: doc.question,
  questionIndex: doc.index,
  answerIndex: doc.answerIndex,
  answeringMethod: doc.answeringMethod,
  subjectIds: Array.isArray(doc.subjectIds) ? doc.subjectIds : [],
  itemAnswer: doc.itemAnswer,
  itemStem: doc.itemStem,
  itemSolution: doc.itemSolution
})

const main = async () => {
  const { input, output } = parseArgs()
  const payload = JSON.parse(await fs.readFile(input, 'utf8'))
  const decisions = normalizeDecisions(payload)

  const sourceIdSet = new Set()
  for (const decision of decisions) {
    for (const example of decision.examples || []) {
      if (example?.sourceId) sourceIdSet.add(example.sourceId)
    }
  }

  const objectIds = Array.from(sourceIdSet)
    .map(toObjectId)
    .filter(Boolean)

  const mongoClient = new MongoClient(config.MONGO_URI_TEST)

  try {
    await mongoClient.connect()
    const collection = mongoClient.db(DB_NAME).collection(COLLECTION_NAME)
    const docs = await collection
      .find({ _id: { $in: objectIds } })
      .project({
        question: 1,
        index: 1,
        answerIndex: 1,
        answeringMethod: 1,
        subjectIds: 1,
        itemAnswer: 1,
        itemStem: 1,
        itemSolution: 1
      })
      .toArray()

    const docMap = new Map(docs.map((doc) => [doc._id.toString(), doc]))
    let missingContextCount = 0

    const enrichedDecisions = decisions.map((decision) => {
      const contexts = (decision.examples || [])
        .map((example) => {
          const doc = docMap.get(example.sourceId)
          if (!doc) {
            missingContextCount++
            return {
              sourceId: example.sourceId,
              missing: true
            }
          }
          return pickContext(doc)
        })

      return {
        id: decision.id,
        correctAnswer: decision.correctAnswer,
        userAnswer: decision.userAnswer,
        count: decision.count,
        examples: decision.examples || [],
        contexts
      }
    })

    const outputPayload = {
      input,
      output,
      contextSummary: {
        sourceIdsRequested: objectIds.length,
        sourceIdsMatched: docs.length,
        missingContextCount
      },
      totalDecisions: enrichedDecisions.length,
      decisions: enrichedDecisions
    }

    await fs.mkdir(path.dirname(output), { recursive: true })
    await fs.writeFile(output, `${JSON.stringify(outputPayload, null, 2)}\n`, 'utf8')

    console.log(JSON.stringify({
      input,
      output,
      totalDecisions: enrichedDecisions.length,
      sourceIdsRequested: objectIds.length,
      sourceIdsMatched: docs.length,
      missingContextCount
    }, null, 2))
  } finally {
    await mongoClient.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

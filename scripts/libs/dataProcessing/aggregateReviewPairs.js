const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const readline = require('readline')

const DEFAULT_INPUT = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full', 'review.ndjson')
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full', 'review-unique-pairs.json')
const DEFAULT_LIMIT = 1000
const DEFAULT_EXAMPLE_LIMIT = 3

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    limit: DEFAULT_LIMIT,
    exampleLimit: DEFAULT_EXAMPLE_LIMIT,
    sortBy: 'count'
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
      continue
    }
    if (arg === '--limit' && args[i + 1]) {
      options.limit = Number.parseInt(args[i + 1], 10)
      i++
      continue
    }
    if (arg === '--example-limit' && args[i + 1]) {
      options.exampleLimit = Number.parseInt(args[i + 1], 10)
      i++
      continue
    }
    if (arg === '--sort-by' && args[i + 1]) {
      options.sortBy = args[i + 1]
      i++
    }
  }

  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error('`--limit` must be a positive integer.')
  }
  if (!Number.isInteger(options.exampleLimit) || options.exampleLimit <= 0) {
    throw new Error('`--example-limit` must be a positive integer.')
  }
  if (!['count', 'firstSeen'].includes(options.sortBy)) {
    throw new Error('`--sort-by` must be one of: count, firstSeen')
  }

  return options
}

const main = async () => {
  const { input, output, limit, exampleLimit, sortBy } = parseArgs()
  const pairMap = new Map()
  let scannedLines = 0
  let firstSeenCounter = 0

  const lineReader = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  for await (const line of lineReader) {
    if (!line.trim()) continue
    scannedLines++
    const item = JSON.parse(line)
    const key = JSON.stringify([item.correctAnswer, item.userAnswer])

    if (!pairMap.has(key)) {
      pairMap.set(key, {
        correctAnswer: item.correctAnswer,
        userAnswer: item.userAnswer,
        count: 0,
        firstSeen: ++firstSeenCounter,
        examples: []
      })
    }

    const entry = pairMap.get(key)
    entry.count++
    if (entry.examples.length < exampleLimit) {
      entry.examples.push({
        sourceId: item.sourceId,
        itemId: item.itemId,
        questionIndex: item.questionIndex,
        answerIndex: item.answerIndex,
        ruleReason: item.ruleReason
      })
    }
  }

  const candidates = Array.from(pairMap.values())
    .sort((a, b) => {
      if (sortBy === 'firstSeen') {
        return a.firstSeen - b.firstSeen
      }
      if (b.count !== a.count) return b.count - a.count
      return a.firstSeen - b.firstSeen
    })
    .slice(0, limit)
    .map((entry, index) => ({
      id: index + 1,
      correctAnswer: entry.correctAnswer,
      userAnswer: entry.userAnswer,
      count: entry.count,
      examples: entry.examples
    }))

  const payload = {
    input,
    output,
    scannedLines,
    uniquePairs: pairMap.size,
    returnedPairs: candidates.length,
    sortBy,
    candidates
  }

  await fsp.mkdir(path.dirname(output), { recursive: true })
  await fsp.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    input,
    output,
    scannedLines,
    uniquePairs: pairMap.size,
    returnedPairs: candidates.length,
    sortBy
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

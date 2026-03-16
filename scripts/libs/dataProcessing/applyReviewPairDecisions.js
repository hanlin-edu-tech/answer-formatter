const fs = require('fs')
const path = require('path')
const readline = require('readline')

const DEFAULT_BASE_DIR = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full')
const DEFAULT_DECISIONS = path.join(DEFAULT_BASE_DIR, 'review-pair-decisions-top1000-progress.json')
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full-v2')

function parseArgs(argv) {
  const options = {
    baseDir: DEFAULT_BASE_DIR,
    decisions: DEFAULT_DECISIONS,
    outputDir: DEFAULT_OUTPUT_DIR,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    if (arg === '--base-dir' && next) {
      options.baseDir = path.resolve(process.cwd(), next)
      index += 1
    } else if (arg === '--decisions' && next) {
      options.decisions = path.resolve(process.cwd(), next)
      index += 1
    } else if (arg === '--output-dir' && next) {
      options.outputDir = path.resolve(process.cwd(), next)
      index += 1
    }
  }

  return options
}

function createPairKey(correctAnswer, userAnswer) {
  return `${String(correctAnswer)}\t${String(userAnswer)}`
}

function appendNdjsonLine(writer, value) {
  writer.write(`${JSON.stringify(value)}\n`)
}

async function pipeFile(source, destination) {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true })

  return new Promise((resolve, reject) => {
    const reader = fs.createReadStream(source)
    const writer = fs.createWriteStream(destination)

    reader.on('error', reject)
    writer.on('error', reject)
    writer.on('finish', resolve)

    reader.pipe(writer)
  })
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  const acceptedInput = path.join(options.baseDir, 'accepted.ndjson')
  const rejectedInput = path.join(options.baseDir, 'rejected.ndjson')
  const reviewInput = path.join(options.baseDir, 'review.ndjson')

  await fs.promises.mkdir(options.outputDir, { recursive: true })

  const decisionData = JSON.parse(await fs.promises.readFile(options.decisions, 'utf8'))
  const decisionMap = new Map()

  for (const decision of decisionData.decisions || []) {
    if (decision.decision !== 'accepted' && decision.decision !== 'rejected') {
      continue
    }

    decisionMap.set(
      createPairKey(decision.correctAnswer, decision.userAnswer),
      {
        decision: decision.decision,
        id: decision.id,
        reason: decision.reason,
        confidence: decision.confidence,
      }
    )
  }

  const acceptedOutput = path.join(options.outputDir, 'accepted.ndjson')
  const rejectedOutput = path.join(options.outputDir, 'rejected.ndjson')
  const reviewOutput = path.join(options.outputDir, 'review.ndjson')
  const movedAcceptedOutput = path.join(options.outputDir, 'accepted.from-review.ndjson')
  const movedRejectedOutput = path.join(options.outputDir, 'rejected.from-review.ndjson')

  await pipeFile(acceptedInput, acceptedOutput)
  await pipeFile(rejectedInput, rejectedOutput)

  const acceptedWriter = fs.createWriteStream(acceptedOutput, { flags: 'a' })
  const rejectedWriter = fs.createWriteStream(rejectedOutput, { flags: 'a' })
  const reviewWriter = fs.createWriteStream(reviewOutput)
  const movedAcceptedWriter = fs.createWriteStream(movedAcceptedOutput)
  const movedRejectedWriter = fs.createWriteStream(movedRejectedOutput)

  const reviewReader = readline.createInterface({
    input: fs.createReadStream(reviewInput),
    crlfDelay: Infinity,
  })

  const summary = {
    baseDir: options.baseDir,
    decisions: options.decisions,
    outputDir: options.outputDir,
    totalDecisionPairs: decisionMap.size,
    reviewLinesProcessed: 0,
    movedToAccepted: 0,
    movedToRejected: 0,
    remainingReview: 0,
  }

  for await (const line of reviewReader) {
    if (!line.trim()) {
      continue
    }

    summary.reviewLinesProcessed += 1

    const record = JSON.parse(line)
    const matched = decisionMap.get(createPairKey(record.correctAnswer, record.userAnswer))

    if (!matched) {
      appendNdjsonLine(reviewWriter, record)
      summary.remainingReview += 1
      continue
    }

    const enrichedRecord = {
      ...record,
      pairDecisionId: matched.id,
      pairDecisionReason: matched.reason,
      pairDecisionConfidence: matched.confidence,
    }

    if (matched.decision === 'accepted') {
      appendNdjsonLine(acceptedWriter, enrichedRecord)
      appendNdjsonLine(movedAcceptedWriter, enrichedRecord)
      summary.movedToAccepted += 1
      continue
    }

    appendNdjsonLine(rejectedWriter, enrichedRecord)
    appendNdjsonLine(movedRejectedWriter, enrichedRecord)
    summary.movedToRejected += 1
  }

  await Promise.all([
    new Promise((resolve) => acceptedWriter.end(resolve)),
    new Promise((resolve) => rejectedWriter.end(resolve)),
    new Promise((resolve) => reviewWriter.end(resolve)),
    new Promise((resolve) => movedAcceptedWriter.end(resolve)),
    new Promise((resolve) => movedRejectedWriter.end(resolve)),
  ])

  summary.totalAfterApply =
    summary.movedToAccepted + summary.movedToRejected + summary.remainingReview

  await fs.promises.writeFile(
    path.join(options.outputDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`
  )

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

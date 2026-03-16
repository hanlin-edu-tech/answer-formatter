const fs = require('fs/promises')
const path = require('path')

const DEFAULT_INPUT = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full', 'review-pair-decisions-top1000-context.json')
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full', 'review-pair-decisions-top1000-progress.json')

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
      continue
    }
  }

  return options
}

const main = async () => {
  const { input, output } = parseArgs()
  const payload = JSON.parse(await fs.readFile(input, 'utf8'))

  const decisions = (payload.decisions || [])
    .map((decision) => ({
      id: decision.id,
      correctAnswer: decision.correctAnswer,
      userAnswer: decision.userAnswer,
      count: decision.count,
      decision: null,
      confidence: null,
      reason: ''
    }))

  const outputPayload = {
    input,
    output,
    totalCandidates: decisions.length,
    decidedThroughId: 0,
    decisions
  }

  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(outputPayload, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify({
    input,
    output,
    totalCandidates: decisions.length
  }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const readline = require('readline')
const answerFormatter = require(path.resolve(__dirname, '../../../src/answerFormatter'))

const DEFAULT_INPUT = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full', 'accepted.ndjson')
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed-full', 'accepted-filtered-by-answer-formatter')

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    input: DEFAULT_INPUT,
    outputDir: DEFAULT_OUTPUT_DIR
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--input' && args[i + 1]) {
      options.input = path.resolve(process.cwd(), args[i + 1])
      i++
      continue
    }
    if (arg === '--output-dir' && args[i + 1]) {
      options.outputDir = path.resolve(process.cwd(), args[i + 1])
      i++
    }
  }

  return options
}

const createLineWriter = (filePath) => {
  const stream = fs.createWriteStream(filePath, { encoding: 'utf8' })
  return {
    write(value) {
      stream.write(`${JSON.stringify(value)}\n`)
    },
    close() {
      return new Promise((resolve, reject) => {
        stream.end((error) => {
          if (error) reject(error)
          else resolve()
        })
      })
    }
  }
}

const main = async () => {
  const { input, outputDir } = parseArgs()
  await fsp.mkdir(outputDir, { recursive: true })

  const supportedWriter = createLineWriter(path.join(outputDir, 'accepted.supported-by-answer-formatter.ndjson'))
  const remainingWriter = createLineWriter(path.join(outputDir, 'accepted.remaining.ndjson'))

  const summary = {
    input,
    outputDir,
    totalAccepted: 0,
    supportedByAnswerFormatter: 0,
    remainingAccepted: 0
  }

  const lineReader = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  try {
    for await (const line of lineReader) {
      if (!line.trim()) continue

      const item = JSON.parse(line)
      summary.totalAccepted++

      const supported = answerFormatter.equals(item.correctAnswer, item.userAnswer)
      if (supported) {
        supportedWriter.write({
          ...item,
          movedBy: 'answerFormatter.equals'
        })
        summary.supportedByAnswerFormatter++
      } else {
        remainingWriter.write(item)
        summary.remainingAccepted++
      }
    }
  } finally {
    await Promise.all([
      supportedWriter.close(),
      remainingWriter.close()
    ])
  }

  await fsp.writeFile(
    path.join(outputDir, 'summary.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8'
  )

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

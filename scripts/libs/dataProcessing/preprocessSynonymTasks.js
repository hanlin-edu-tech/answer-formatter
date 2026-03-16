const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const readline = require('readline')

const DEFAULT_INPUT_PATH = path.resolve(process.cwd(), 'tmp', 'synonym-tasks.ndjson')
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'tmp', 'synonym-preprocessed')

const normalizeWhitespace = (value) => value.trim().replace(/\s+/g, ' ')

const stripHtmlTags = (value) => value.replace(/<[^>]*>/g, ' ')

// 先把常見 Unicode 變體字形收斂，後面的規則就不需要重複處理。
const normalizeDigitVariants = (value) =>
  value
    .replace(/⓪/g, '0')
    .replace(/①/g, '1')
    .replace(/②/g, '2')
    .replace(/③/g, '3')
    .replace(/④/g, '4')
    .replace(/⑤/g, '5')
    .replace(/⑥/g, '6')
    .replace(/⑦/g, '7')
    .replace(/⑧/g, '8')
    .replace(/⑨/g, '9')
    .replace(/⑩/g, '10')
    .replace(/⑪/g, '11')
    .replace(/⑫/g, '12')
    .replace(/⑬/g, '13')
    .replace(/⑭/g, '14')
    .replace(/⑮/g, '15')
    .replace(/⑯/g, '16')
    .replace(/⑰/g, '17')
    .replace(/⑱/g, '18')
    .replace(/⑲/g, '19')
    .replace(/⑳/g, '20')

const normalizeFullWidthAscii = (value) =>
  value.replace(/[！-～]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ')

const DECIMAL_DOT_PLACEHOLDER = '__DECIMAL_DOT__'
const NUMERIC_COMMA_PLACEHOLDER = '__NUMERIC_COMMA__'

const protectNumericSeparators = (value) =>
  value
    .replace(/(?<=\d)[.。．](?=\d)/g, DECIMAL_DOT_PLACEHOLDER)
    .replace(/(?<=\d)[,，](?=\d)/g, NUMERIC_COMMA_PLACEHOLDER)

const normalizePunctuation = (value) =>
  protectNumericSeparators(value)
    .replace(/[()（）［］【】\[\]「」『』〔〕]/g, '')
    .replace(/[.。．、,，;；:：!！?？·•‧'"`]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replaceAll(DECIMAL_DOT_PLACEHOLDER, '.')
    .replaceAll(NUMERIC_COMMA_PLACEHOLDER, ',')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeForTextCompare = (value) =>
  normalizePunctuation(normalizeDigitVariants(normalizeFullWidthAscii(normalizeWhitespace(stripHtmlTags(value)))))

const normalizeForMathCompare = (value) =>
  normalizeDigitVariants(normalizeFullWidthAscii(normalizeWhitespace(stripHtmlTags(value))))
    .replace(/\s+/g, '')
    .replace(/－/g, '-')
    .replace(/＋/g, '+')

const isAlgebraicExpressionLike = (value) => {
  const normalized = normalizeForMathCompare(value)
  return /[a-z]/i.test(normalized) && /[+\-*/()]/.test(normalized)
}

const isPlaceholderValue = (value) => {
  if (!value) return true
  if (/^https?:\/\//i.test(value)) return true
  if (/^[?_＿×xX＊*＋+\-－/\\.=~～]+$/.test(value)) return true
  return false
}

const isSuspiciousRepeatedDigitString = (value) => {
  const normalized = normalizeDigitVariants(normalizeFullWidthAscii(value)).replace(/\s+/g, '')
  return /^(\d)\1{7,}$/.test(normalized)
}

const parseNumericExpression = (value) => {
  const ascii = normalizeDigitVariants(normalizeFullWidthAscii(value))
    .replace(/，/g, ',')
    .replace(/－/g, '-')
    .replace(/＋/g, '+')
    .replace(/\s+/g, '')

  const match = ascii.match(/^([+-]?(?:\d+(?:\.\d+)?|\d+\/\d+))(x|cm)?$/i)
  if (!match) return null

  const rawNumber = match[1]
  const unit = (match[2] || '').toLowerCase()
  const number = rawNumber.includes('/')
    ? (() => {
        const [numerator, denominator] = rawNumber.split('/').map(Number)
        if (!denominator) return null
        return numerator / denominator
      })()
    : Number(rawNumber)

  if (number === null || Number.isNaN(number)) return null
  return { number, unit }
}

const looksLikeNumericNotation = (value) => {
  const ascii = normalizeDigitVariants(normalizeFullWidthAscii(value))
    .replace(/\s+/g, '')
    .replace(/－/g, '-')
    .replace(/＋/g, '+')

  return /^[+-]?[\d.,]+(?:x|cm)?$/i.test(ascii)
}

const areEquivalentNumbers = (left, right) => {
  const a = parseNumericExpression(left)
  const b = parseNumericExpression(right)
  if (!a || !b) return false
  if (a.unit !== b.unit) return false
  return Math.abs(a.number - b.number) < 1e-9
}

const isNumericNotationMismatch = (left, right) => {
  if (!looksLikeNumericNotation(left) || !looksLikeNumericNotation(right)) return false
  if (areEquivalentNumbers(left, right)) return false
  return true
}

const normalizeRatio = (value) => {
  const ascii = normalizeDigitVariants(normalizeFullWidthAscii(value)).replace(/\s+/g, '')
  const match = ascii.match(/^([+-]?\d+(?:\.\d+)?):([+-]?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const left = Number(match[1])
  const right = Number(match[2])
  if (Number.isNaN(left) || Number.isNaN(right) || right === 0) return null
  return left / right
}

const areEquivalentRatios = (left, right) => {
  const a = normalizeRatio(left)
  const b = normalizeRatio(right)
  if (a === null || b === null) return false
  return Math.abs(a - b) < 1e-9
}

const isFormattingEquivalent = (left, right) => {
  if (isAlgebraicExpressionLike(left) || isAlgebraicExpressionLike(right)) return false
  return normalizeForTextCompare(left) === normalizeForTextCompare(right)
}

const normalizeEnglishToken = (value) =>
  normalizeForTextCompare(value)
    .toLowerCase()
    .replace(/[^a-z]/g, '')

const isAsciiWord = (value) => /^[A-Za-z .'-]+$/.test(value)
const FUNCTION_WORD_SET = new Set([
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had',
  'do', 'does', 'did',
  'a', 'an', 'the',
  'in', 'on', 'at', 'for', 'to', 'from', 'of', 'with', 'by',
  'he', 'she', 'it', 'they', 'them', 'his', 'her', 'their',
  'this', 'that', 'these', 'those',
  'and', 'or', 'but'
])

const getEditDistance = (left, right) => {
  if (left === right) return 0
  if (!left.length) return right.length
  if (!right.length) return left.length

  const prev = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    let diagonal = prev[0]
    prev[0] = i
    for (let j = 1; j <= right.length; j++) {
      const current = prev[j]
      if (left[i - 1] === right[j - 1]) {
        prev[j] = diagonal
      } else {
        prev[j] = Math.min(diagonal + 1, prev[j] + 1, prev[j - 1] + 1)
      }
      diagonal = current
    }
  }
  return prev[right.length]
}

const isEnglishTypoMismatch = (left, right) => {
  if (!isAsciiWord(left) || !isAsciiWord(right)) return false

  const normalizedLeft = normalizeEnglishToken(left)
  const normalizedRight = normalizeEnglishToken(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return false
  if (Math.abs(normalizedLeft.length - normalizedRight.length) > 1) return false
  if (Math.min(normalizedLeft.length, normalizedRight.length) < 5) return false

  return getEditDistance(normalizedLeft, normalizedRight) === 1
}

const parseCoordinate = (value) => {
  const normalized = normalizeDigitVariants(normalizeFullWidthAscii(value))
    .replace(/[（）]/g, (char) => (char === '（' ? '(' : ')'))
    .replace(/，/g, ',')
    .replace(/－/g, '-')
    .replace(/\s+/g, '')

  const match = normalized.match(/^\(([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)\)$/)
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  if (Number.isNaN(x) || Number.isNaN(y)) return null
  return { x, y }
}

const parseCoordinateWithoutParentheses = (value) => {
  const normalized = normalizeDigitVariants(normalizeFullWidthAscii(value))
    .replace(/，/g, ',')
    .replace(/－/g, '-')
    .replace(/\s+/g, '')

  const match = normalized.match(/^([+-]?\d+(?:\.\d+)?),([+-]?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const x = Number(match[1])
  const y = Number(match[2])
  if (Number.isNaN(x) || Number.isNaN(y)) return null
  return { x, y }
}

const areEquivalentCoordinates = (left, right) => {
  const a = parseCoordinate(left)
  const b = parseCoordinate(right)
  if (!a || !b) return false
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9
}

const areDifferentCoordinates = (left, right) => {
  const a = parseCoordinate(left)
  const b = parseCoordinate(right)
  if (!a || !b) return false
  return Math.abs(a.x - b.x) >= 1e-9 || Math.abs(a.y - b.y) >= 1e-9
}

const isCoordinateBracketMismatch = (left, right) => {
  const leftCoordinate = parseCoordinate(left)
  const rightCoordinate = parseCoordinate(right)
  const leftBareCoordinate = parseCoordinateWithoutParentheses(left)
  const rightBareCoordinate = parseCoordinateWithoutParentheses(right)

  if (leftCoordinate && rightBareCoordinate) return true
  if (rightCoordinate && leftBareCoordinate) return true
  return false
}

const BOPOMOFO_RE = /^[ㄅ-ㄩ]+[ˊˇˋ˙]?$/u

const isCompleteBopomofo = (value) => BOPOMOFO_RE.test(value)

const isBopomofoMismatch = (left, right) => isCompleteBopomofo(left) && isCompleteBopomofo(right) && left !== right

const isBopomofoGarbage = (value) => {
  if (!/[ㄅ-ㄩˊˇˋ˙]/u.test(value)) return false
  if (isCompleteBopomofo(value)) return false
  return true
}

const isSymbolOrEmojiGarbage = (value) => {
  if ([...value].length !== 1) return false
  if (/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(value)) return true
  if (/[\u{1F170}-\u{1F251}]/u.test(value)) return true
  return false
}

const isEnglishFunctionWordMismatch = (left, right) => {
  if (!isAsciiWord(left) || !isAsciiWord(right)) return false
  const normalizedLeft = normalizeEnglishToken(left)
  const normalizedRight = normalizeEnglishToken(right)
  if (!normalizedLeft || !normalizedRight || normalizedLeft === normalizedRight) return false
  return FUNCTION_WORD_SET.has(normalizedLeft) && FUNCTION_WORD_SET.has(normalizedRight)
}

const normalizeOptionToken = (value) =>
  normalizeDigitVariants(normalizeFullWidthAscii(value))
    .replace(/[()（）\s]/g, '')
    .toUpperCase()

const isOptionLabel = (value) => /^[A-Z甲乙丙丁戊己庚辛壬癸]$/.test(normalizeOptionToken(value))

const isOptionLabelEquivalent = (left, right) => {
  if (!isOptionLabel(left) || !isOptionLabel(right)) return false
  return normalizeOptionToken(left) === normalizeOptionToken(right)
}

const isOptionLabelMismatch = (left, right) => {
  const normalizedLeft = normalizeOptionToken(left)
  const normalizedRight = normalizeOptionToken(right)
  if (!isOptionLabel(left) || !isOptionLabel(right)) return false
  return normalizedLeft !== normalizedRight
}

const parseDirectionLabel = (value) => {
  const normalized = normalizeDigitVariants(normalizeFullWidthAscii(value))
    .replace(/\s+/g, '')
    .replace(/－/g, '-')
  const match = normalized.match(/^([+-]?\d+(?:\.\d+)?)°([NSEW])$/i)
  if (!match) return null
  return { degree: Number(match[1]), direction: match[2].toUpperCase() }
}

const isDirectionLabelMismatch = (left, right) => {
  const a = parseDirectionLabel(left)
  const b = parseDirectionLabel(right)
  if (!a || !b) return false
  return a.degree === b.degree && a.direction !== b.direction
}

const parsePlusMinusValue = (value) => {
  const normalized = normalizeDigitVariants(normalizeFullWidthAscii(value))
    .replace(/\s+/g, '')
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
  const match = normalized.match(/^±([+-]?\d+(?:\.\d+)?)$/)
  if (!match) return null
  const number = Number(match[1])
  if (Number.isNaN(number)) return null
  return number
}

const isPlusMinusMismatch = (left, right) => {
  const plusMinusLeft = parsePlusMinusValue(left)
  const plusMinusRight = parsePlusMinusValue(right)
  const numericLeft = parseNumericExpression(left)
  const numericRight = parseNumericExpression(right)

  if (plusMinusLeft !== null && numericRight && Math.abs(plusMinusLeft - numericRight.number) < 1e-9) return true
  if (plusMinusRight !== null && numericLeft && Math.abs(plusMinusRight - numericLeft.number) < 1e-9) return true
  return false
}

const isRepeatedCharacterGarbage = (value) => {
  const compact = value.replace(/\s+/g, '')
  if ([...compact].length < 5) return false
  if (/^(.)(\1){4,}$/u.test(compact)) return true
  return /^(.{2,3})\1{2,}$/u.test(compact)
}

const isCoordinateVsScalarMismatch = (left, right) => {
  const leftCoordinate = parseCoordinate(left)
  const rightCoordinate = parseCoordinate(right)
  const leftNumeric = parseNumericExpression(left)
  const rightNumeric = parseNumericExpression(right)

  if (leftCoordinate && rightNumeric) return true
  if (rightCoordinate && leftNumeric) return true
  return false
}

const isAlgebraicVsScalarMismatch = (left, right) => {
  const leftAlgebraic = isAlgebraicExpressionLike(left)
  const rightAlgebraic = isAlgebraicExpressionLike(right)
  const leftNumeric = parseNumericExpression(left)
  const rightNumeric = parseNumericExpression(right)

  if (leftAlgebraic && rightNumeric) return true
  if (rightAlgebraic && leftNumeric) return true
  return false
}

const isObviousNonSynonym = (left, right) => {
  const leftNum = parseNumericExpression(left)
  const rightNum = parseNumericExpression(right)
  if (leftNum && rightNum && !areEquivalentNumbers(left, right)) return true

  const leftRatio = normalizeRatio(left)
  const rightRatio = normalizeRatio(right)
  if (leftRatio !== null && rightRatio !== null && !areEquivalentRatios(left, right)) return true

  if (left.length === 1 && right.length === 1 && left !== right) return true
  return false
}

const classifyTask = (task) => {
  const correctAnswer = typeof task.correctAnswer === 'string' ? task.correctAnswer.trim() : ''
  const userAnswer = typeof task.userAnswer === 'string' ? task.userAnswer.trim() : ''

  // 規則順序有意義：先跑便宜且可確定的規則，剩下的模糊案例才留給 review。
  if (isPlaceholderValue(userAnswer)) {
    return { bucket: 'rejected', reason: 'placeholder-or-noise' }
  }

  if (isSuspiciousRepeatedDigitString(userAnswer)) {
    return { bucket: 'rejected', reason: 'repeated-digit-garbage' }
  }

  if (areEquivalentCoordinates(correctAnswer, userAnswer)) {
    return { bucket: 'accepted', reason: 'coordinate-format-equivalent' }
  }

  if (isCoordinateBracketMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'coordinate-bracket-mismatch' }
  }

  if (isOptionLabelEquivalent(correctAnswer, userAnswer)) {
    return { bucket: 'accepted', reason: 'option-label-equivalent' }
  }

  if (isFormattingEquivalent(correctAnswer, userAnswer)) {
    return { bucket: 'accepted', reason: 'formatting-equivalent' }
  }

  if (areEquivalentNumbers(correctAnswer, userAnswer)) {
    return { bucket: 'accepted', reason: 'numeric-equivalent' }
  }

  if (areEquivalentRatios(correctAnswer, userAnswer)) {
    return { bucket: 'accepted', reason: 'ratio-equivalent' }
  }

  if (isOptionLabelMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'option-label-mismatch' }
  }

  if (isEnglishTypoMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'english-typo-mismatch' }
  }

  if (isDirectionLabelMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'direction-label-mismatch' }
  }

  if (isPlusMinusMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'plus-minus-mismatch' }
  }

  if (areDifferentCoordinates(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'coordinate-mismatch' }
  }

  if (isCoordinateVsScalarMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'coordinate-vs-scalar-mismatch' }
  }

  if (isBopomofoMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'bopomofo-mismatch' }
  }

  if (isBopomofoGarbage(userAnswer)) {
    return { bucket: 'rejected', reason: 'bopomofo-garbage' }
  }

  if (isSymbolOrEmojiGarbage(userAnswer)) {
    return { bucket: 'rejected', reason: 'symbol-or-emoji-garbage' }
  }

  if (isRepeatedCharacterGarbage(userAnswer)) {
    return { bucket: 'rejected', reason: 'repeated-char-garbage' }
  }

  if (isEnglishFunctionWordMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'english-function-word-mismatch' }
  }

  if (isNumericNotationMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'numeric-notation-mismatch' }
  }

  if (isAlgebraicVsScalarMismatch(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'algebraic-vs-scalar-mismatch' }
  }

  if (isObviousNonSynonym(correctAnswer, userAnswer)) {
    return { bucket: 'rejected', reason: 'obvious-mismatch' }
  }

  return { bucket: 'review', reason: 'needs-semantic-review' }
}

const parseArgs = () => {
  const args = process.argv.slice(2)
  const options = {
    input: DEFAULT_INPUT_PATH,
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

  const acceptedWriter = createLineWriter(path.join(outputDir, 'accepted.ndjson'))
  const rejectedWriter = createLineWriter(path.join(outputDir, 'rejected.ndjson'))
  const reviewWriter = createLineWriter(path.join(outputDir, 'review.ndjson'))

  const summary = {
    total: 0,
    accepted: 0,
    rejected: 0,
    review: 0
  }

  const lineReader = readline.createInterface({
    input: fs.createReadStream(input, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })

  try {
    for await (const line of lineReader) {
      if (!line.trim()) continue
      const task = JSON.parse(line)
      const result = classifyTask(task)
      const outputTask = { ...task, ruleReason: result.reason }

      summary.total++
      summary[result.bucket]++

      if (result.bucket === 'accepted') acceptedWriter.write(outputTask)
      else if (result.bucket === 'rejected') rejectedWriter.write(outputTask)
      else reviewWriter.write(outputTask)

      if (summary.total % 50000 === 0) {
        console.log(`Preprocessed ${summary.total} tasks.`)
      }
    }
  } finally {
    await Promise.all([
      acceptedWriter.close(),
      rejectedWriter.close(),
      reviewWriter.close()
    ])
  }

  const finalSummary = { ...summary, input, outputDir }
  await fsp.writeFile(path.join(outputDir, 'summary.json'), `${JSON.stringify(finalSummary, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(finalSummary, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

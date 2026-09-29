const express = require('express')
const cors = require('cors')
const config = require('./libs/config')
const api = require('./libs/api')
const { PORT = 8080, FORMAT_RULE_SHEET_SUBJECTS } = config.getConfig()

const __buildMatchTable = (sheet = []) => {
  const matchTable = []
  for (const row of sheet) {
    const match = {
      primeText: row[0]?.trim(),
      matchText: row.slice(1).filter(text => text?.trim())
    }
    matchTable.push(match)
  }
  return matchTable
}

const __RULE_KINDS = ['variantMatch', 'fullMatch', 'partialMatch']

// 分科設定寫錯時直接讓 job 失敗：靜默略過會讓該科悄悄退回只套全科通用規則
const __parseSubjectSheets = (raw = '{}') => {
  let subjectSheets
  try {
    subjectSheets = JSON.parse(raw)
  } catch (err) {
    throw new Error(`FORMAT_RULE_SHEET_SUBJECTS is not valid JSON: ${err.message}`)
  }
  if (!subjectSheets || typeof subjectSheets !== 'object' || Array.isArray(subjectSheets)) {
    throw new Error('FORMAT_RULE_SHEET_SUBJECTS must be a JSON object keyed by subject')
  }
  return subjectSheets
}

// 分頁抓取失敗（__fetchWithRetry 回 null）時也讓 job 失敗，避免上傳缺了該科規則的表
const __buildSubjects = async (subjectSheets = {}) => {
  const subjects = {}
  for (const [subject, sheetConfig] of Object.entries(subjectSheets)) {
    const subjectTable = {}
    for (const kind of __RULE_KINDS) {
      if (!sheetConfig[kind]) continue
      const sheet = await api.getSheet(sheetConfig[kind])
      if (!sheet) {
        throw new Error(`Failed to fetch ${kind} sheet of subject ${subject} (gid ${sheetConfig[kind]})`)
      }
      subjectTable[kind] = __buildMatchTable(sheet)
    }
    if (sheetConfig.ignoreCase === true) {
      subjectTable.ignoreCase = true
    }
    subjects[subject] = subjectTable
  }
  return subjects
}

const __runJob = async () => {
  const subjects = await __buildSubjects(__parseSubjectSheets(FORMAT_RULE_SHEET_SUBJECTS))
  const partialMatchSheet = await api.getPartialMatchSheet() || []
  const fullMatchSheet = await api.getFullMatchSheet() || []
  const variantMatchSheet = await api.getVariantMatchSheet() || []
  const partialMatchTable = __buildMatchTable(partialMatchSheet)
  const fullMatchTable = __buildMatchTable(fullMatchSheet)
  const updateTime = new Date().getTime()
  // v1 給舊版 SDK：格式不變，舊版不認得 variantMatch
  const matchTableV1 = {
    updateTime,
    partialMatch: partialMatchTable,
    fullMatch: fullMatchTable
  }
  // v2 給新版 SDK：多了 variantMatch，答案與表上字串都會先套用這一層。
  // subjects 為分科規則，不認得的 SDK 會忽略，因此不另開版本路徑
  const matchTable = {
    updateTime,
    variantMatch: __buildMatchTable(variantMatchSheet),
    partialMatch: partialMatchTable,
    fullMatch: fullMatchTable,
    ...(Object.keys(subjects).length ? { subjects } : {})
  }
  await api.uploadToS3(matchTableV1, 'v1/api/answerFormatter/matchTable.json')
  await api.uploadToS3(matchTable, 'v2/api/answerFormatter/matchTable.json')
  await api.clearCloudFront(['/v1/api/answerFormatter/matchTable.json', '/v2/api/answerFormatter/matchTable.json'])
  return matchTable
}

const app = express()

app.use(cors())
app.use(express.json()) // Middleware to parse JSON bodies

app.post('/match-table', async (req, res) => {
  try {
    const result = await __runJob()
    res.status(200).json({ success: true, result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/judge-answer', async (req, res) => {
  try {
    const { answer1, answer2 } = req.body
    if (!answer1 || !answer2) {
      return res.status(400).json({ success: false, error: 'Both answer1 and answer2 are required in the request body.' })
    }

    const isEquivalent = await api.judgeByLLM(answer1, answer2)
    res.status(200).json({ success: true, isEquivalent })
  } catch (err) {
    // 檢查是否為我們從 api.js 拋出的自訂錯誤物件
    if (err && err.status) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    // 對於其他未預期的錯誤，回傳 500
    res.status(500).json({ success: false, error: 'An unexpected error occurred on the server.' })
  }
})

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})

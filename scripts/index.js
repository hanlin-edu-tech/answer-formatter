const express = require('express')
const cors = require('cors')
const config = require('./libs/config')
const api = require('./libs/api')
const { parseFormatterSettings } = require('./libs/formatterSettings')
const { PORT = 8080, FORMAT_RULE_SHEET_SUBJECTS, FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS } = config.getConfig()

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

// 分頁重試用盡時 getSheet 會拋錯，補上科目與分頁再往外拋，讓 job 失敗，避免上傳缺了該科規則的表
const __buildSubjects = async (subjectSheets = {}) => {
  const subjects = {}
  for (const [subject, sheetConfig] of Object.entries(subjectSheets)) {
    const subjectTable = {}
    for (const kind of __RULE_KINDS) {
      if (!sheetConfig[kind]) continue
      let sheet
      try {
        sheet = await api.getSheet(sheetConfig[kind])
      } catch (err) {
        throw new Error(`Failed to fetch ${kind} sheet of subject ${subject} (gid ${sheetConfig[kind]}): ${err.message}`)
      }
      subjectTable[kind] = __buildMatchTable(sheet)
    }
    subjects[subject] = subjectTable
  }
  return subjects
}

// 未設定 gid 時回傳空設定；設定了卻抓不到時讓 job 失敗，避免上傳少了開關的表
const __getFormatterSettings = async () => {
  if (!FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS) return { formatters: {}, subjects: {} }
  let sheet
  try {
    sheet = await api.getSheet(FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS)
  } catch (err) {
    throw new Error(`Failed to fetch formatter settings sheet (gid ${FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS}): ${err.message}`)
  }
  return parseFormatterSettings(sheet)
}

const __runJob = async () => {
  const subjects = await __buildSubjects(__parseSubjectSheets(FORMAT_RULE_SHEET_SUBJECTS))
  const formatterSettings = await __getFormatterSettings()
  // 只在「科目設定」出現的科目也建立：可以只調開關、不另設分科規則。
  // 整列空白也要寫入空的 formatters：SDK 以有無此欄位判斷該科是否列在設定上（有列就不退回全科）
  for (const [subject, { formatters }] of Object.entries(formatterSettings.subjects)) {
    subjects[subject] = { ...subjects[subject], formatters }
  }
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
  // matchTable.v2.json 給新版 SDK：多了 variantMatch，答案與表上字串都會先套用這一層。
  // formatters 為全科的 formatter 開關、subjects 為分科規則與開關；不認得的 SDK 會忽略，因此不另開版本路徑
  const matchTable = {
    updateTime,
    variantMatch: __buildMatchTable(variantMatchSheet),
    partialMatch: partialMatchTable,
    fullMatch: fullMatchTable,
    ...(Object.keys(formatterSettings.formatters).length ? { formatters: formatterSettings.formatters } : {}),
    ...(Object.keys(subjects).length ? { subjects } : {})
  }
  await api.uploadToS3(matchTableV1, 'v1/api/answerFormatter/matchTable.json')
  await api.uploadToS3(matchTable, 'v1/api/answerFormatter/matchTable.v2.json')
  await api.clearCloudFront(['/v1/api/answerFormatter/matchTable.json', '/v1/api/answerFormatter/matchTable.v2.json'])
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

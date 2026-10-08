const express = require('express')
const cors = require('cors')
const config = require('./libs/config')
const api = require('./libs/api')
const { parseFormatterSettings } = require('./libs/formatterSettings')
const { parseMatchSheet } = require('./libs/matchSheet')
const { checkRuleExamples } = require('./libs/ruleExamples')
const { checkRuleEffect } = require('./libs/ruleEffect')
const { findPartialCycles } = require('./libs/ruleCycles')
const { PORT = 8080, FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS, FORMAT_RULE_SHEET_GID_RULE_EXAMPLES } = config.getConfig()

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

// 用 S3 上的 SDK（使用端實際載入的版本）檢查即將上傳的表：
// - 規則表範例（設定了 gid 才檢查）：不符時讓 job 失敗，避免上傳讓範例判錯的表
// - 每一列規則是否生效：只列為警告（見 libs/ruleEffect.js）
const __checkWithSdk = async (matchTable) => {
  const warnings = []
  let sdk
  try {
    sdk = await api.loadSdk()
  } catch (err) {
    if (FORMAT_RULE_SHEET_GID_RULE_EXAMPLES) throw new Error(`Failed to load SDK for rule examples: ${err.message}`)
    warnings.push(`無法載入 SDK，略過規則生效檢查：${err.message}`)
    return warnings
  }
  if (FORMAT_RULE_SHEET_GID_RULE_EXAMPLES) {
    let sheet
    try {
      sheet = await api.getSheet(FORMAT_RULE_SHEET_GID_RULE_EXAMPLES)
    } catch (err) {
      throw new Error(`Failed to fetch rule examples sheet (gid ${FORMAT_RULE_SHEET_GID_RULE_EXAMPLES}): ${err.message}`)
    }
    const { failures, warnings: exampleWarnings } = checkRuleExamples(sdk, matchTable, sheet)
    if (failures.length) {
      throw new Error(`Rule examples failed (SDK ${sdk.version}), not uploaded:\n${failures.join('\n')}`)
    }
    warnings.push(...exampleWarnings)
  }
  warnings.push(...checkRuleEffect(sdk, matchTable))
  warnings.forEach(warning => console.warn(`Match table warning: ${warning}`))
  return warnings
}

const __runJob = async () => {
  const formatterSettings = await __getFormatterSettings()
  // 完整／部分答案對答分頁：每列勾選套用的科目（見 libs/matchSheet.js）
  const partial = parseMatchSheet(await api.getPartialMatchSheet() || [])
  const full = parseMatchSheet(await api.getFullMatchSheet() || [])
  const variant = parseMatchSheet(await api.getVariantMatchSheet() || [])
  const ruleSubjects = [...new Set([...full.subjectColumns, ...partial.subjectColumns, ...variant.subjectColumns])]
  const updateTime = new Date().getTime()
  // v1 給舊版 SDK：格式不變，不帶科目資訊（所有 enabled 的列），舊版不認得 variantMatch
  const matchTableV1 = {
    updateTime,
    partialMatch: partial.rulesV1,
    fullMatch: full.rulesV1
  }
  // matchTable.v2.json 給新版 SDK：多了 variantMatch，答案與表上字串都會先套用這一層。
  // 規則列的 subjects 為勾選的科目（各科都勾時省略），ruleSubjects 為表上的科目欄；
  // formatters 為全科的 formatter 開關、subjects 為各科開關。不認得的 SDK 會忽略，因此不另開版本路徑
  const matchTable = {
    updateTime,
    variantMatch: variant.rules,
    partialMatch: partial.rules,
    fullMatch: full.rules,
    ...(ruleSubjects.length ? { ruleSubjects } : {}),
    ...(Object.keys(formatterSettings.formatters).length ? { formatters: formatterSettings.formatters } : {}),
    ...(Object.keys(formatterSettings.subjects).length ? { subjects: formatterSettings.subjects } : {})
  }
  // 部分對答規則互相改寫而不會收斂時讓 job 失敗（sc-134172）
  const cycles = findPartialCycles(matchTable.partialMatch, ruleSubjects)
  if (cycles.length) throw new Error(`Partial match rules have cycles, not uploaded:\n${cycles.join('\n')}`)
  const warnings = await __checkWithSdk(matchTable)
  await api.uploadToS3(matchTableV1, 'v1/api/answerFormatter/matchTable.json')
  await api.uploadToS3(matchTable, 'v1/api/answerFormatter/matchTable.v2.json')
  await api.clearCloudFront(['/v1/api/answerFormatter/matchTable.json', '/v1/api/answerFormatter/matchTable.v2.json'])
  return { matchTable, warnings }
}

const app = express()

app.use(cors())
app.use(express.json()) // Middleware to parse JSON bodies

app.post('/match-table', async (req, res) => {
  try {
    const { matchTable, warnings } = await __runJob()
    res.status(200).json({ success: true, result: matchTable, warnings })
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

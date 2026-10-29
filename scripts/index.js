const express = require('express')
const cors = require('cors')
const config = require('./libs/config')
const logger = require('./libs/logger')
const api = require('./libs/api')
const { parseFormatterSettings } = require('./libs/formatterSettings')
const { parseMatchSheet } = require('./libs/matchSheet')
const { checkRuleExamples } = require('./libs/ruleExamples')
const { checkRuleEffect } = require('./libs/ruleEffect')
const { findPartialCycles } = require('./libs/ruleCycles')
const { checkContractCases } = require('./libs/contractCases')
const { diffMatchTable, changeMessages } = require('./libs/tableDiff')
const { PORT = 8080, FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS } = config.getConfig()

// 未設定 gid 時回傳空設定；設定了卻抓不到時讓 job 失敗，避免上傳少了開關的表。
// 同一張分頁也放規則範例（標準寫法、輸入答案、對答呈現），分頁內容一併回傳給範例檢查
const __getFormatterSettings = async (warnings) => {
  if (!FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS) return { settings: { formatters: {}, subjects: {} }, sheet: null }
  let sheet
  try {
    sheet = await api.getSheet(FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS)
  } catch (err) {
    throw new Error(`Failed to fetch formatter settings sheet (gid ${FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS}): ${err.message}`)
  }
  return { settings: parseFormatterSettings(sheet, warnings), sheet }
}

// 用 S3 上的 SDK（使用端實際載入的版本）檢查即將上傳的表：
// - 使用端依賴的對應（見 libs/contractCases.js）：不符時讓 job 失敗，避免停用或改掉使用端依賴的列（kb-1005720）
// - 設定表上的規則範例（有設定表才檢查）：不符時讓 job 失敗，避免上傳讓範例判錯的表
// - 每一列規則是否生效：只列為警告（見 libs/ruleEffect.js）
// 契約案例一定要檢查，SDK 載入失敗就讓 job 失敗
const __checkWithSdk = async (matchTable, settingsSheet, warnings = []) => {
  let sdk
  try {
    sdk = await api.loadSdk()
  } catch (err) {
    throw new Error(`Failed to load SDK for match table checks: ${err.message}`)
  }
  const contractFailures = checkContractCases(sdk, matchTable)
  if (contractFailures.length) {
    throw new Error(`Contract cases failed (SDK ${sdk.version}), not uploaded:\n${contractFailures.join('\n')}`)
  }
  if (settingsSheet) {
    const { failures, warnings: exampleWarnings } = checkRuleExamples(sdk, matchTable, settingsSheet)
    if (failures.length) {
      throw new Error(`Rule examples failed (SDK ${sdk.version}), not uploaded:\n${failures.join('\n')}`)
    }
    warnings.push(...exampleWarnings)
  }
  warnings.push(...checkRuleEffect(sdk, matchTable))
  return warnings
}

const __runJob = async () => {
  const settingsWarnings = []
  const { settings: formatterSettings, sheet: settingsSheet } = await __getFormatterSettings(settingsWarnings)
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
  const warnings = await __checkWithSdk(matchTable, settingsSheet, settingsWarnings)
  warnings.forEach(warning => logger.warning(`Match table warning: ${warning}`))
  // 上傳前和線上的表比對，記下這次改了什麼（kb-1005721）；只寫進 log，不跳給編輯（kb-1005467）
  const changes = diffMatchTable(await api.getPublishedMatchTable(), matchTable, settingsSheet)
  const messages = changeMessages(changes)
  messages.forEach(message => logger.notice(`Match table change: ${message}`))
  // 任一份上傳失敗就拋錯讓 job 失敗，不清 CloudFront（kb-1005828）
  await api.uploadToS3(matchTableV1, 'v1/api/answerFormatter/matchTable.json')
  await api.uploadToS3(matchTable, 'v1/api/answerFormatter/matchTable.v2.json')
  await api.clearCloudFront(['/v1/api/answerFormatter/matchTable.json', '/v1/api/answerFormatter/matchTable.v2.json'])
  // changes 只計真正的變動：沒有變動為 0，抓不到線上的表（沒比對）為 null
  logger.notice('Match table job finished', { updateTime, warnings: warnings.length, changes: changes ? changes.length : null })
  return { matchTable, warnings }
}

const app = express()

app.use(cors())
app.use(express.json()) // Middleware to parse JSON bodies

app.post('/match-table', async (req, res) => {
  try {
    // 提醒與變動只寫進 log（__runJob）：企劃要求成功時只顯示「轉檔完成」（kb-1005467、kb-1005461）。
    // warnings 欄位留著給 Apps Script 讀，固定回空陣列
    const { matchTable } = await __runJob()
    res.status(200).json({ success: true, result: matchTable, warnings: [] })
  } catch (err) {
    logger.error(`Match table job failed: ${err.message}`, { stack: err.stack })
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
  logger.info(`Server listening on port ${PORT}`)
})

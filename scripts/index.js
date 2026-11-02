const express = require('express')
const cors = require('cors')
const config = require('./libs/config')
const logger = require('./libs/logger')
const api = require('./libs/api')
const { buildMatchTable } = require('./libs/matchTableBuilder')
const { diffMatchTable, changeMessages } = require('./libs/tableDiff')
const { SheetProblemsError, failureMessage, successMessage } = require('./libs/editorMessages')
const { PORT = 8080, FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS } = config.getConfig()

// 未設定 gid 時回傳 null（沒有設定表）；設定了卻抓不到時讓 job 失敗，避免上傳少了開關的表。
// 同一張分頁也放規則範例（標準寫法、輸入答案、對答呈現）
const __getSettingsSheet = async () => {
  if (!FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS) return null
  try {
    return await api.getSheet(FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS)
  } catch (err) {
    throw Object.assign(new Error(`Failed to fetch formatter settings sheet (gid ${FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS}): ${err.message}`), { kind: err.kind })
  }
}

// 表填錯的地方一次全部列給編輯，有任何一個就不上傳（見 libs/matchTableBuilder.js，kb-1005461）
const __runJob = async () => {
  const sheets = {
    settingsSheet: await __getSettingsSheet(),
    partialSheet: await api.getPartialMatchSheet(),
    fullSheet: await api.getFullMatchSheet(),
    variantSheet: await api.getVariantMatchSheet()
  }
  const { matchTable, matchTableV1, warnings, problems } = await buildMatchTable(sheets, () => api.loadSdk())
  const { updateTime } = matchTable
  warnings.forEach(warning => logger.warning(`Match table warning: ${warning}`))
  if (problems.length) {
    // 處理過程（detail）只寫進 log
    problems.filter(problem => problem.detail).forEach(problem => logger.warning(`Match table problem detail: ${problem.detail}`))
    throw new SheetProblemsError(problems)
  }
  // 上傳前和線上的表比對，記下這次改了什麼（kb-1005721）；只寫進 log，不跳給編輯（kb-1005467）
  const changes = diffMatchTable(await api.getPublishedMatchTable(), matchTable, sheets.settingsSheet)
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

// 回應的 message（成功）／error（失敗）是給編輯看的完整訊息，Apps Script 照原樣顯示（kb-1005461）。
// request body 可帶 sheetNames（分頁編號 gid → 目前的分頁名稱），訊息裡的分頁名稱照試算表上的寫
app.post('/match-table', async (req, res) => {
  const sheetNames = req.body?.sheetNames
  try {
    // 提醒與變動只寫進 log（__runJob）：企劃要求成功時只顯示更新完成（kb-1005467、kb-1005461）。
    // warnings 欄位留著給舊版 Apps Script 讀，固定回空陣列
    const { matchTable } = await __runJob()
    res.status(200).json({ success: true, result: matchTable, warnings: [], message: successMessage(matchTable.updateTime) })
  } catch (err) {
    const { kind, message } = failureMessage(err, sheetNames)
    logger.error(`Match table job failed: ${err.message}`, { stack: err.stack, kind })
    res.status(500).json({ success: false, kind, error: message })
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

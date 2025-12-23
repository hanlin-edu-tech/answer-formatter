const express = require('express')
const cors = require('cors')
const config = require('./libs/config')
const api = require('./libs/api')
const { PORT = 8080 } = config.getConfig()

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

const __runJob = async () => {
  const partialMatchSheet = await api.getPartialMatchSheet() || []
  const fullMatchSheet = await api.getFullMatchSheet() || []
  const partialMatchTable = __buildMatchTable(partialMatchSheet)
  const fullMatchTable = __buildMatchTable(fullMatchSheet)
  const matchTable = {
    updateTime: new Date().getTime(),
    partialMatch: partialMatchTable,
    fullMatch: fullMatchTable
  }
  await api.uploadToS3(matchTable, 'v1/api/answerFormatter/matchTable.json')
  await api.clearCloudFront(['/v1/api/answerFormatter/matchTable.json'])
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

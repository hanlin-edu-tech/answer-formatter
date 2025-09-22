const express = require('express')
const config = require('./libs/config')
const api = require('./libs/api')

const { PORT = 8080 } = config.getConfig()

const __buildMatchTable = (sheet = []) => {
  const matchTable = []
  for (const row of sheet) {
    const primeText = row[0]?.trim()
    if (primeText) {
      const match = {
        primeText,
        matchText: row.slice(1).filter(text => text?.trim())
      }
      matchTable.push(match)
    }
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

app.post('/match-table', async (req, res) => {
  try {
    const result = await __runJob()
    res.status(200).json({ success: true, result })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})

const { getConfig } = require('./libs/config')
const api = require('./libs/api')

const __BuildMatchTable = (sheet = []) => {
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

const main = async () => {
  try {
    const partialMatchSheet = await api.getPartialMatchSheet() || []
    const fullMatchSheet = await api.getFullMatchSheet() || []
    const partialMatchTable = __BuildMatchTable(partialMatchSheet)
    const fullMatchTable = __BuildMatchTable(fullMatchSheet)
    const matchTable = {
      partialMatch: partialMatchTable,
      fullMatch: fullMatchTable
    }
    await api.uploadToS3(matchTable, 'v1/api/answerFormatter/matchTable.json')
  } catch (err) {
    console.error(err)
  }
}

main()

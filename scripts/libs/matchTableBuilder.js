const logger = require('./logger')
const { parseFormatterSettings } = require('./formatterSettings')
const { parseMatchSheet } = require('./matchSheet')
const { checkRuleExamples } = require('./ruleExamples')
const { checkRuleEffect } = require('./ruleEffect')
const { findPartialCycles } = require('./ruleCycles')
const { checkContractCases } = require('./contractCases')

// 解析完整／部分答案對答、異體寫法分頁，表填錯的地方標上分頁加到 problems
const __parseMatchSheet = (sheet, key, problems) => {
  const sheetProblems = []
  const parsed = parseMatchSheet(sheet || [], sheetProblems)
  problems.push(...sheetProblems.map(problem => ({ sheet: key, ...problem })))
  return parsed
}

/**
 * @description 由試算表分頁產生 matchTable，並檢查表有沒有填錯（不抓表、不上傳，見 scripts/index.js）。
 * 表填錯的地方（problems，見 editorMessages）不在第一個就停下：全部檢查完一次列給編輯，
 * 有任何一個就不該上傳（kb-1005461）。用 loadSdk() 載入的 SDK（使用端實際載入的版本）檢查：
 * - 使用端依賴的對應（見 contractCases.js）：避免停用或改掉使用端依賴的列（kb-1005720）
 * - 設定表上的規則範例（有設定表才檢查）：避免上傳讓範例判錯的表
 * - 每一列規則是否生效：只列為警告（見 ruleEffect.js）；已經有問題時不檢查
 * SDK 載入失敗時拋錯（系統內部錯誤）。
 * @param {{ settingsSheet?: string[][]|null, partialSheet?: string[][], fullSheet?: string[][], variantSheet?: string[][]|null }} sheets - settingsSheet 為 null 表示沒有設定表
 * @param {() => Promise<object>} loadSdk
 * @param {number} [updateTime]
 * @returns {Promise<{ matchTable: object, matchTableV1: object, warnings: string[], problems: object[] }>}
 */
const buildMatchTable = async ({ settingsSheet = null, partialSheet, fullSheet, variantSheet }, loadSdk, updateTime = Date.now()) => {
  const warnings = []
  const problems = []
  // 設定表分頁：各科套用哪些 formatter（見 formatterSettings.js）
  const formatterSettings = settingsSheet ? parseFormatterSettings(settingsSheet, warnings, problems) : { formatters: {}, subjects: {} }
  // 完整／部分答案對答分頁：每列勾選套用的科目（見 matchSheet.js）
  const partial = __parseMatchSheet(partialSheet, 'partialMatch', problems)
  const full = __parseMatchSheet(fullSheet, 'fullMatch', problems)
  const variant = __parseMatchSheet(variantSheet, 'variantMatch', problems)
  const ruleSubjects = [...new Set([...full.subjectColumns, ...partial.subjectColumns, ...variant.subjectColumns])]
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
  // 部分對答規則互相改寫而不會收斂時擋下（sc-134172）
  problems.push(...findPartialCycles(matchTable.partialMatch, ruleSubjects, partial.rowNumbers))

  let sdk
  try {
    sdk = await loadSdk()
  } catch (err) {
    throw new Error(`Failed to load SDK for match table checks: ${err.message}`)
  }
  logger.info(`Checking match table with SDK ${sdk.version}`)
  const sources = { fullMatch: full.rows, partialMatch: partial.rows, variantMatch: variant.rows }
  problems.push(...checkContractCases(sdk, matchTable, undefined, sources))
  if (settingsSheet) {
    const { failures, warnings: exampleWarnings } = checkRuleExamples(sdk, matchTable, settingsSheet)
    problems.push(...failures)
    warnings.push(...exampleWarnings)
  }
  if (!problems.length) warnings.push(...checkRuleEffect(sdk, matchTable))
  return { matchTable, matchTableV1, warnings, problems }
}

module.exports = { buildMatchTable }

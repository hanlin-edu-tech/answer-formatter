const answerFormatter = require('../src/answerFormatter')
const { SUBJECT_KEYS, keyOf, normalize } = require('../src/libs/subjects')
const defaultTable = require('../src/data/matchTable.json')

// 表上的科目換成對答表代碼（國文 → PC），其餘不變：後端改用英文代碼後轉出的表（kb-1006085）
const withKeys = (table) => {
  const rows = rules => (rules || []).map(rule => rule.subjects ? { ...rule, subjects: rule.subjects.map(keyOf) } : rule)
  return {
    ...table,
    variantMatch: rows(table.variantMatch),
    fullMatch: rows(table.fullMatch),
    partialMatch: rows(table.partialMatch),
    ...(table.ruleSubjects ? { ruleSubjects: table.ruleSubjects.map(keyOf) } : {}),
    ...(table.subjects ? { subjects: Object.fromEntries(Object.entries(table.subjects).map(([subject, config]) => [keyOf(subject), config])) } : {})
  }
}

describe('對答表的科目用英文代碼（kb-1006085）', () => {
  let original
  beforeEach(() => { original = answerFormatter.matchTable })
  afterEach(() => { answerFormatter.matchTable = original })

  it('科目名稱與對答表代碼互相對應', () => {
    expect(SUBJECT_KEYS).toEqual({ 國文: 'PC', 英文: 'EN', 數學: 'MA', 自然: 'NA', 社會: 'SO' })
    expect(keyOf('數學')).toBe('MA')
    expect(keyOf('生活')).toBeUndefined()
  })

  it('呼叫端也可以傳對答表代碼，轉成科目名稱', () => {
    expect(normalize('MA')).toBe('數學')
    expect(normalize(['X-XX', 'NA'])).toBe('自然')
    expect(normalize('J-MA,EN')).toBe('數學')
    expect(normalize('數學')).toBe('數學')
    expect(normalize('XX')).toBe('XX')
  })

  it('內建表（正式機快照）換成英文代碼後，各種帶科目的方式 format、explain、subjectOf 結果都不變', () => {
    const named = defaultTable
    const keyed = withKeys(defaultTable)
    expect(keyed.ruleSubjects).toEqual(['PC', 'EN', 'MA', 'NA', 'SO'])
    // 表上所有寫法都當成作答跑一次
    const answers = [...new Set(['fullMatch', 'partialMatch', 'variantMatch'].flatMap(kind =>
      (named[kind] || []).flatMap(({ primeText, matchText }) => [primeText, ...matchText])))].filter(Boolean)
    expect(answers.length).toBeGreaterThan(500)
    const subjects = [undefined, '國文', '英文', '數學', '自然', '社會', 'J-MA', 'H-PC', 'MA', 'EN', 'X-XX', '生活']
    const run = (table) => {
      answerFormatter.matchTable = table
      return subjects.map(subject => {
        const options = subject === undefined ? undefined : { subject }
        return {
          subjectOf: answerFormatter.subjectOf(subject),
          explainSubject: answerFormatter.explain('1', options).subject,
          formatted: answers.map(answer => answerFormatter.format(answer, options))
        }
      })
    }
    expect(run(keyed)).toEqual(run(named))
  })

  it('分科列、各科開關都照代碼套用', () => {
    const table = {
      fullMatch: [],
      partialMatch: [{ primeText: '〉', matchText: ['>'], subjects: ['PC'] }],
      ruleSubjects: ['PC', 'MA'],
      subjects: { MA: { formatters: { numberFormatter: true } } }
    }
    answerFormatter.matchTable = table
    expect(answerFormatter.equals('〉', '>', { subject: '國文' })).toBe(true)
    expect(answerFormatter.equals('〉', '>', { subject: 'J-MA' })).toBe(false)
    expect(answerFormatter.equals('12,345', '12345', { subject: '數學' })).toBe(true)
    expect(answerFormatter.equals('12,345', '12345', { subject: 'PC' })).toBe(false)
    expect(answerFormatter.subjectOf('J-MA')).toBe('數學')
  })
})

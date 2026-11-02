const { checkContractCases } = require('../scripts/libs/contractCases')
const answerFormatter = require('../src/answerFormatter')

// 線上表與是非題相關的列（kb-1005668 修正後）
const fullMatch = [
  { primeText: 'true', matchText: ['◯', '○', 'O', 'o'] },
  { primeText: 'false', matchText: ['╳', 'X', 'x', '✕', '×'] }
]
const partialMatch = [{ primeText: '×', matchText: ['x', '*', '╳', '✕'] }]
// 分頁上的列（見 parseMatchSheet 的 rows）：完整答案對答第 2、3 列，部分答案對答第 2 列
const rowsOf = (rules, enabled = rules.map(() => true)) => rules.map((rule, i) => ({ rowNumber: i + 2, primeText: rule.primeText, matchText: rule.matchText, enabled: enabled[i] }))
const sources = { fullMatch: rowsOf(fullMatch), partialMatch: rowsOf(partialMatch) }
const check = (table, rowSources = sources) => checkContractCases(answerFormatter, table, undefined, rowSources)

describe('使用端契約案例（kb-1005720）', () => {
  it('是非題的 true／false 列都在、數字沒被改寫時通過', () => {
    expect(check({ fullMatch, partialMatch })).toEqual([])
  })

  it('false 列被停用時回報一則：哪一列、為什麼不能停用（kb-1005461）', () => {
    const problems = check({ fullMatch: fullMatch.slice(0, 1), partialMatch }, { ...sources, fullMatch: rowsOf(fullMatch, [true, false]) })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({
      sheet: 'fullMatch',
      location: '第 3 列（false ← ╳、X、x、✕、×）',
      text: '被停用了。是非題作答時會送「false」，要靠這一列對到「╳」「×」「X」，否則所有是非題都會判錯。請把這一列的 enabled 勾回來。'
    })
    // 處理過程只寫進 log
    expect(problems[0].detail).toContain('學生寫法「false」')
    expect(problems[0].detail).toContain('標準答案「╳」')
  })

  it('false 列被刪掉時說找不到那一列', () => {
    const problems = check({ fullMatch: fullMatch.slice(0, 1), partialMatch }, { ...sources, fullMatch: rowsOf(fullMatch.slice(0, 1)) })
    expect(problems.map(({ sheet, location, text }) => ({ sheet, location, text }))).toEqual([{
      sheet: 'fullMatch',
      location: '',
      text: '找不到「false」那一列，可能被刪掉了。是非題作答時會送「false」，要靠這一列對到「╳」「×」「X」，否則所有是非題都會判錯。請加回這一列；不確定的話請找工程。'
    }])
  })

  it('false 列被改掉時指出那一列和對不到的標準答案', () => {
    const changed = [fullMatch[0], { primeText: 'false', matchText: ['╳'] }]
    const problems = check({ fullMatch: changed, partialMatch: [] }, { fullMatch: rowsOf(changed) })
    expect(problems.map(({ location, text }) => location + text)).toEqual([
      '第 3 列（false ← ╳）被改掉了，作答「false」對不到「×」「X」。是非題作答時會送「false」，這一列不能改，否則所有是非題都會判錯。請改回原本的內容；不確定的話請找工程。'
    ])
  })

  it('false 列只勾部分科目時仍通過：ms-check-answer 不帶科目，會套用所有列', () => {
    const table = { fullMatch: [fullMatch[0], { ...fullMatch[1], subjects: ['自然'] }], partialMatch, ruleSubjects: ['國文', '自然'] }
    expect(check(table)).toEqual([])
  })

  it('false 被加進 true 那列時回報與 ○ 判定相等，指出是哪一列', () => {
    const merged = [{ ...fullMatch[0], matchText: [...fullMatch[0].matchText, 'false'] }, fullMatch[1]]
    expect(check({ fullMatch: merged, partialMatch }, { ...sources, fullMatch: rowsOf(merged) })).toContainEqual({
      sheet: 'fullMatch',
      location: '第 2 列（true ← ◯、○、O、o、false）',
      text: '讓作答「false」和標準答案「○」被判成一樣。是非題作答時會送「false」，這樣答錯也會判對。請檢查這一列；不確定的話請找工程。'
    })
  })

  it('改寫數字的列會讓選項編號判錯，同一列改寫的編號合併成一則；只勾某科也會影響', () => {
    const partial = [...partialMatch, { primeText: '一', matchText: ['1'], subjects: ['國文'] }]
    const table = { fullMatch, partialMatch: partial, ruleSubjects: ['國文', '數學'] }
    expect(check(table, { ...sources, partialMatch: rowsOf(partial) })).toEqual([{
      sheet: 'partialMatch',
      location: '第 3 列（一 ← 1）',
      text: '把選項編號「1」「10」改寫成「一」「一0」。選擇題作答時會送選項編號「1」～「10」，這些數字不能被改寫，否則多選題會整題判錯。請刪掉或停用這一列；不確定的話請找工程。'
    }])
  })

  it('目前內建的預設表通過', () => {
    expect(checkContractCases(answerFormatter, require('../src/data/matchTable.json'))).toEqual([])
  })
})

const { checkRuleEffect } = require('../scripts/libs/ruleEffect')
const answerFormatter = require('../src/answerFormatter')

describe('對答表規則生效檢查（列為警告）', () => {
  it('部分對答改寫後撞上完整對答的標準答案而被還原時提出警告', () => {
    // 先前的實例：單獨作答「無煙囪產業」換成「觀光業」後撞上完整對答而還原
    const table = {
      fullMatch: [{ primeText: '觀光業', matchText: ['旅遊業'] }],
      partialMatch: [{ primeText: '觀光業', matchText: ['無煙囪產業'] }]
    }
    expect(checkRuleEffect(answerFormatter, table)).toEqual([
      [
        '部分答案對答表「無煙囪產業」單獨作答時與標準答案「觀光業」判定不相等〔不帶科目〕',
        '學生寫法「無煙囪產業」',
        '　1. 部分答案對答表：把「無煙囪產業」換成「觀光業」',
        '　2. 部分答案對答表的改寫被取消：結果「觀光業」剛好是完整答案對答表某列的標準寫法，改回「無煙囪產業」',
        '　最後拿來比對：「無煙囪產業」',
        '標準答案「觀光業」',
        '　沒有被改寫',
        '　最後拿來比對：「觀光業」'
      ].join('\n')
    ])
  })

  it('規則都生效時沒有警告；接續改寫、刪除列都算生效', () => {
    const table = {
      fullMatch: [{ primeText: '盧溝橋事變', matchText: ['七七事變'] }],
      partialMatch: [
        { primeText: '度', matchText: ['°'] },
        { primeText: '°C', matchText: ['℃', '攝氏'] },
        { primeText: '', matchText: ['《', '》'] }
      ]
    }
    expect(checkRuleEffect(answerFormatter, table)).toEqual([])
  })

  it('只勾部分科目的列只在那些科目檢查，同一列多科不生效時合併成一則', () => {
    const table = {
      ruleSubjects: ['國文', '英文', '數學'],
      // Y 改寫成 X 後，X 單獨作答會再被完整對答換成 Z，兩者判不相等
      fullMatch: [{ primeText: 'Z', matchText: ['X'] }],
      partialMatch: [{ primeText: 'X', matchText: ['Y'], subjects: ['英文', '數學'] }]
    }
    // 國文沒勾，不檢查；不帶科目時套用所有列，一併檢查
    expect(checkRuleEffect(answerFormatter, table)).toEqual([
      [
        '部分答案對答表「Y」單獨作答時與標準答案「X」判定不相等〔不帶科目、英文、數學〕',
        '學生寫法「Y」',
        '　1. 部分答案對答表：把「Y」換成「X」',
        '　最後拿來比對：「X」',
        '標準答案「X」',
        '　1. 完整答案對答表：整個答案「X」等於這列的其他寫法，換成標準寫法「Z」',
        '　最後拿來比對：「Z」'
      ].join('\n')
    ])
  })

  it('被其他規則搶先改寫時，提醒列出兩邊各自經過的規則', () => {
    // 句點夾在國字中間時，間隔號互通先把它換成「·」，「.」←「﹒」這列就用不上
    const table = { fullMatch: [], partialMatch: [{ primeText: '﹒', matchText: ['.'] }] }
    expect(checkRuleEffect(answerFormatter, table)).toEqual([
      [
        '部分答案對答表「.」放在較長答案裡時（以「甲…乙」檢查）與標準答案「﹒」判定不相等〔不帶科目〕',
        '學生寫法「甲.乙」',
        '　1. 規則「間隔號互通」：「甲.乙」變成「甲·乙」',
        '　最後拿來比對：「甲·乙」',
        '標準答案「甲﹒乙」',
        '　沒有被改寫',
        '　最後拿來比對：「甲﹒乙」'
      ].join('\n')
    ])
  })

  it('刪除頓號的列改由「寫不寫分隔號都算對」負責：只提醒可以刪除，同一列其他寫法照常檢查（kb-1005031）', () => {
    const table = {
      ruleSubjects: ['國文'],
      fullMatch: [],
      partialMatch: [{ primeText: '', matchText: ['、', '《'] }],
      subjects: { 國文: { formatters: { answerOrder: true } } }
    }
    expect(checkRuleEffect(answerFormatter, table)).toEqual([
      '部分答案對答表「（刪除）← 、」：頓號有沒有寫改由設定表「寫不寫分隔號都算對」決定，這一列可以刪除（留著會讓沒勾的科目也刪掉頓號）'
    ])
  })

  it('答案結構規則讓答案被拆開時，寫明不採用上一步的結果，並照原答案順序列出拆出來的答案', () => {
    // 用 stub 模擬答案結構規則讓對答表的改寫用不上（kb-1005287 修正後真實 SDK 已不會出現這種組合）
    const trace = (normalized, steps = [], structure = null) => ({ normalized, steps, structure, variantMatch: [], fullMatch: null, partialMatch: [] })
    const sdk = {
      matchTable: {},
      equals: () => false,
      // 關掉「多個答案順序可互換」時不拆答案，讓檢查找得出是這條規則
      explain (text) {
        return text === '甲、乙' && this.matchTable.formatters?.answerOrder !== false
        ? { ...trace('乙、甲', [{ formatter: 'synonymsFormatter', enabled: true, before: '甲、乙', after: '甲乙' }], { before: '甲乙', after: '乙、甲' }),
          partialMatch: [{ primeText: '', matchedText: '、', before: '甲、乙', after: '甲乙', reverted: false }] }
          : trace(text)
      }
    }
    const [warning] = checkRuleEffect(sdk, { fullMatch: [], partialMatch: [{ primeText: '甲乙', matchText: ['甲、乙'] }] })
    expect(warning).toContain('　1. 部分答案對答表：刪掉「、」，「甲、乙」變成「甲乙」')
    expect(warning).toContain('　2. 規則「多個答案順序可互換」：不採用上一步的結果，改從原答案「甲、乙」拆成 2 個答案「甲」「乙」')
    expect(warning).toContain('　最後拿來比對：2 個答案「甲」「乙」（比對時不分順序）')
    expect(warning).not.toContain('乙、甲')
  })

  it('檢查完還原 SDK 原本的 matchTable', () => {
    const original = answerFormatter.matchTable
    checkRuleEffect(answerFormatter, { fullMatch: [], partialMatch: [] })
    expect(answerFormatter.matchTable).toBe(original)
  })
})

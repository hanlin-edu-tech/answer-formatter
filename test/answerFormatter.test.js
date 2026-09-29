/**
 * 同義詞表快照與格式化基準由 test/fixtures/generate.js 產生。
 * 遠端表更新或調整 formatter 後，重跑該腳本更新 fixture。
 * 讀 fixture 而非打遠端 API，測試才不會因遠端資料變動而無預警轉紅。
 */
jest.mock('../src/libs/api', () => ({
  getMatchTable: jest.fn(),
  judgeByLLM: jest.fn()
}))

const api = require('../src/libs/api')
const answerFormatter = require('../src/answerFormatter')
const formatters = require('../src/libs/formatters')
const matchTable = require('./fixtures/matchTable.json')
const baseline = require('./fixtures/formatBaseline.json')
const latexKeys = require('./fixtures/latexKeys.json')

beforeAll(() => {
  answerFormatter.matchTable = matchTable
})

describe('answerFormatter', () => {
  describe('toStringFormatter', () => {
    it('should convert value to string', () => {
      expect(answerFormatter.format(123)).toContain('123')
    })
  })

  describe('fullwidthFormatter', () => {
    it('should convert fullwidth to halfwidth', () => {
      expect(answerFormatter.format('ＡｂＣ１２３')).toContain('AbC123')
    })
  })

  describe('synonymsFormatter', () => {
    it('should replace synonyms', () => {
      for (const { primeText, matchText } of matchTable.fullMatch) {
        expect(answerFormatter.format(matchText[0])).toBe(answerFormatter.format(primeText))
      }
    })
  })

  describe('latexFormatter', () => {
    it('should remove \\ and latex patterns', () => {
      expect(answerFormatter.format('\\ sss')).toBe('sss')
      expect(answerFormatter.format('{ }')).toBe('')
      expect(answerFormatter.format('₁₂₃')).toBe('_1_2_3')
    })

    it.each([
      ['\\frac {1}{2}', '1/2'],
      ['\\frac {1}{2}+\\frac {1}{3}', '1/2+1/3'],
      ['\\frac {\\frac {1}{2}}{3}', '1/2/3'],
      ['x^{2}', 'x^2'],
      ['x_{z}^{y}', 'x_z^y'],
      ['\\sqrt{2}', '√2'],
      ['\\sqrt[3]{8}', '^3√8'],
      ['\\left|x\\right|', '|x|'],
      ['\\left({1},{2}\\right)', '(1,2)'],
      ['\\left[x\\right]', '[x]'],
      ['\\overline{AB}', 'AB'],
      ['\\overrightarrow{AB}', 'AB'],
      ['\\underline{AB}', 'AB'],
      ['\\log_{2}8', 'log_28'],
      ['\\sum_{1}^{n}', 'Σ_1^n'],
      ['\\text{甲級}', '甲級'],
      ['\\pi r^{2}', 'πr^2'],
      ['3\\times 4\\div 2', '3×4÷2']
    ])('線性化 %s 成 %s', (input, expected) => {
      expect(answerFormatter.format(input)).toBe(expected)
    })

    it('unicode 上標與下標轉成 ^ 與 _', () => {
      expect(answerFormatter.format('x²')).toBe('x^2')
      expect(answerFormatter.format('H₂O')).toBe('H_2O')
    })

    it('符號表的每個方程式鍵都能線性化成純文字', () => {
      // fixture 由 keyboardCodes.json 抽出，來源與擷取日期記在檔案裡。
      // 這裡只驗線性化本身，不經同義詞等後續 formatter（'x' 會被同義詞表換成 'false'）
      const latexFormatter = formatters.find(f => f.name === 'latexFormatter')
      const residue = []
      for (const key of latexKeys.keys) {
        const output = latexFormatter(key.input)
        if (output !== key.output || /[\\{}]/.test(output)) {
          residue.push(`${JSON.stringify(key.input)}: ${JSON.stringify(key.output)} -> ${JSON.stringify(output)}`)
        }
      }
      expect(residue).toEqual([])
      expect(latexKeys.keys.length).toBe(66)
    })
  })

  describe('方程式輸入與答案庫純文字答案的等價', () => {
    // 學生用方程式鍵輸入 vs 答案庫既有的純文字答案。這組案例是本功能的驗收指標：
    // 未做線性化前只有 2 組判定相等。
    it.each([
      ['\\frac {1}{2}', '1/2'],
      ['\\frac {3}{4}', '3/4'],
      ['x^{2}', 'x²'],
      ['\\sqrt{2}', '√2'],
      ['\\sqrt[3]{8}', '³√8'],
      ['\\left|-5\\right|', '|-5|'],
      ['\\left({3},{4}\\right)', '(3,4)'],
      ['\\overline{AB}', 'AB'],
      ['\\overrightarrow{AB}', 'AB'],
      ['3\\times 4', '3×4'],
      ['\\log_{2}8', 'log₂8'],
      ['\\pi r^{2}', 'πr²'],
      ['H_{2}O', 'H₂O'],
      ['\\Delta t', 'Δt'],
      ['\\text{甲級}', '甲級'],
      ['\\text{面積為}\\frac {1}{2}\\times 底\\times 高', '面積為1/2×底×高']
    ])('%s 應等於 %s', (latexInput, plainAnswer) => {
      expect(answerFormatter.equals(latexInput, plainAnswer)).toBe(true)
    })

    // 帶分數沒有共通寫法：'6又13分之6' 的中文數字念法無法由 LaTeX 機械推得，
    // 需要答案書寫規範才能處理（已於 sc-126464 請企劃確認）
    it.failing('帶分數與中文數字念法目前無法等價', () => {
      expect(answerFormatter.equals('6\\frac {6}{13}', '6又13分之6')).toBe(true)
    })
  })

  describe('removeSpaceFormatter', () => {
    it('should remove spaces and control chars', () => {
      expect(answerFormatter.format(' 甲\u200B乙\t丙 ')).toBe('甲乙丙')
      expect(answerFormatter.format('3 cm')).toBe('3cm')
      expect(answerFormatter.format('x + 1')).toBe('x+1')
    })

    it('英文單字間保留一個空白', () => {
      expect(answerFormatter.format(' a  b\tc ')).toBe('a b c')
      expect(answerFormatter.equals('a part', 'apart')).toBe(false)
      expect(answerFormatter.equals('may be', 'maybe')).toBe(false)
      expect(answerFormatter.equals('I  am', 'I am')).toBe(true)
    })

    it('數學式字母間的空白同樣保留（刻意取捨：formatter 無法分辨英文句與算式）', () => {
      expect(answerFormatter.equals('x y', 'xy')).toBe(false)
      expect(answerFormatter.equals('\\sin x', 'sinx')).toBe(false)
      expect(answerFormatter.equals('\\sin x', 'sin x')).toBe(true)
    })
  })

  describe('removeTailPeriodFormatter', () => {
    it('should remove tail period', () => {
      expect(answerFormatter.format('abc。')).toContain('abc')
    })
  })

  describe('phoneticFormatter', () => {
    it('should transform phonetic symbols', () => {
      expect(answerFormatter.format('ˉㄅ')).toBe('ㄅ')
    })
  })

  describe('equals', () => {
    it('should compare formatted answers correctly', () => {
      expect(answerFormatter.equals('台灣', '臺灣')).toBe(true)
      expect(answerFormatter.equals('O', 'true')).toBe(true)
      expect(answerFormatter.equals('╳', 'false')).toBe(true)
      expect(answerFormatter.equals('《test》', 'test')).toBe(true)
      expect(answerFormatter.equals('〈本紀〉', '本紀')).toBe(true)
      expect(answerFormatter.equals('啓', '啟')).toBe(true)
      expect(answerFormatter.equals('姊', '姐')).toBe(true)
      expect(answerFormatter.equals('污', '汙')).toBe(true)
      expect(answerFormatter.equals('砂', '沙')).toBe(true)
      expect(answerFormatter.equals('1，234', '1,234')).toBe(true)
      expect(answerFormatter.equals('1‚234', '1,234')).toBe(true)
      expect(answerFormatter.equals('a,bcd', 'a,bcd')).toBe(true)
      expect(answerFormatter.equals('’', "'")).toBe(true)
      expect(answerFormatter.equals('＝', '=')).toBe(true)
    })

    it('should treat latex-escaped answer as its plain form', () => {
      expect(answerFormatter.equals('\\ x', 'x')).toBe(true)
    })
  })
})

describe('formatter 順序迴歸', () => {
  it('formatter 順序與基準一致', () => {
    // 順序一變，下方全表比對的失敗清單就是受影響的規則
    expect(formatters.map(f => f.name)).toEqual(baseline.formatterOrder)
  })

  it('全表格式化結果與基準一致', () => {
    const drifted = []
    for (const entry of baseline.entries) {
      let output = null
      try {
        output = answerFormatter.format(entry.input)
      } catch (err) {
        output = `<throw: ${err.message}>`
      }
      if (output !== entry.output) {
        drifted.push(`[${entry.kind}] ${JSON.stringify(entry.input)}: ${JSON.stringify(entry.output)} -> ${JSON.stringify(output)}`)
      }
    }
    expect(drifted).toEqual([])
  })

  it('同義詞規則生效數不低於基準', () => {
    const effective = baseline.entries.filter(entry => {
      if (entry.input === entry.primeText) return false
      return answerFormatter.format(entry.input) === answerFormatter.format(entry.primeText)
    }).length
    const baselineEffective = baseline.entries.filter(e => e.input !== e.primeText && e.equalsPrime === true).length
    expect(effective).toBeGreaterThanOrEqual(baselineEffective)
  })
})

describe('fullMatch 的 primeText 與 matchText 判定一致', () => {
  // 曾經的缺陷（sc-118976）：fullMatch 命中時直接 return primeText，跳過 partialMatch
  // 與排在 synonymsFormatter 之前的 formatter，兩條路徑因此分岔：
  //   format('一戰')           -> '第一次世界大戰'（fullMatch return，未經 partialMatch）
  //   format('第一次世界大戰') -> '第ㄧ次世界大戰'（走 partialMatch，漢字一被換成注音ㄧ）
  // 結果是答同義詞的學生會被判錯。修正後兩路一致，失效群組須維持 0。
  const BROKEN_GROUP_COUNT = 0

  const brokenGroups = () => {
    const groups = []
    for (const { primeText = '', matchText = [] } of matchTable.fullMatch || []) {
      if (matchText.some(text => !answerFormatter.equals(text, primeText))) {
        groups.push(primeText)
      }
    }
    return groups
  }

  it('規則失效的群組數未增加', () => {
    expect(brokenGroups().length).toBeLessThanOrEqual(BROKEN_GROUP_COUNT)
  })

  it('fullMatch 的每個 matchText 都應與其 primeText 判定相等', () => {
    expect(brokenGroups()).toEqual([])
  })
})

describe('字中多打空白仍能命中同義詞', () => {
  // removeSpaceFormatter 曾排在 synonymsFormatter 之後：'一 戰' 以原樣進同義詞比對，
  // 比不到 matchText '一戰'，去空白後已錯過同義詞階段而被判錯。
  // 英文字母間的空白有意義，不在此列
  afterEach(() => {
    answerFormatter.matchTable = matchTable
  })

  it('fullMatch 每個寫法字中插入空白後仍與原寫法相等', () => {
    const broken = []
    for (const { matchText = [] } of matchTable.fullMatch || []) {
      for (const text of matchText) {
        if (text.length < 2 || /\s/.test(text) || /^[A-Za-z]{2}/.test(text)) continue
        const spaced = `${text[0]} ${text.slice(1)}`
        if (!answerFormatter.equals(text, spaced)) broken.push(spaced)
      }
    }
    expect(broken).toEqual([])
  })

  it('表上含空白的寫法仍命中 fullMatch', () => {
    answerFormatter.matchTable = {
      fullMatch: [{ primeText: '蔣渭水高速公路', matchText: ['Freeway No. 5'] }],
      partialMatch: []
    }
    expect(answerFormatter.format('Freeway No. 5')).toBe('蔣渭水高速公路')
    expect(answerFormatter.format('Freeway  No.5')).toBe('蔣渭水高速公路')
    expect(answerFormatter.format('FreewayNo.5')).toBe('FreewayNo.5')
  })

  it('英文單字間去空白後不會跨字觸發 partialMatch', () => {
    answerFormatter.matchTable = {
      fullMatch: [],
      partialMatch: [{ primeText: '人工智慧', matchText: ['AI'] }]
    }
    expect(answerFormatter.format('SEA IS')).toBe('SEA IS')
  })

  it('含空白的 primeText 仍觸發 partialMatch 撞上 fullMatch 時的還原', () => {
    answerFormatter.matchTable = {
      fullMatch: [{ primeText: 'He is not', matchText: ["He isn't"] }],
      partialMatch: [{ primeText: 'He is not', matchText: ['He aint'] }]
    }
    expect(answerFormatter.format('He aint')).toBe('He aint')
  })
})

describe('deepEquals 的 LLM 判斷為 opt-in', () => {
  beforeEach(() => {
    api.judgeByLLM.mockReset()
    answerFormatter.enableLLM(false)
  })

  afterAll(() => {
    answerFormatter.enableLLM(false)
  })

  it('預設關閉且不掛載 deepEquals', () => {
    // 讀 require 後的初始狀態，確保部署新版 SDK 不會意外暴露 LLM 路徑
    const fresh = jest.requireActual('../src/answerFormatter')
    expect(fresh.llmEnabled).toBe(false)
    expect(fresh.deepEquals).toBeUndefined()
  })

  it('關閉時 deepEquals 不存在', () => {
    expect(answerFormatter.deepEquals).toBeUndefined()
    expect('deepEquals' in answerFormatter).toBe(false)
  })

  it('啟用後才掛載 deepEquals', () => {
    answerFormatter.enableLLM()
    expect(typeof answerFormatter.deepEquals).toBe('function')
  })

  it('再關閉即移除 deepEquals', () => {
    answerFormatter.enableLLM()
    answerFormatter.enableLLM(false)
    expect(answerFormatter.deepEquals).toBeUndefined()
  })

  it('啟用後格式化已相等則不呼叫後端', async () => {
    api.judgeByLLM.mockResolvedValue(true)
    answerFormatter.enableLLM()
    await expect(answerFormatter.deepEquals('台灣', '臺灣')).resolves.toBe(true)
    expect(api.judgeByLLM).not.toHaveBeenCalled()
  })

  it('啟用後格式化不相等才呼叫後端', async () => {
    api.judgeByLLM.mockResolvedValue(true)
    answerFormatter.enableLLM()
    await expect(answerFormatter.deepEquals('台灣', '日本')).resolves.toBe(true)
    expect(api.judgeByLLM).toHaveBeenCalledWith('台灣', '日本')
  })

  it('後端拋錯時回 false', async () => {
    api.judgeByLLM.mockRejectedValue(new Error('boom'))
    answerFormatter.enableLLM()
    await expect(answerFormatter.deepEquals('台灣', '日本')).resolves.toBe(false)
  })

  it('持有舊 reference 在關閉後呼叫會拋錯', async () => {
    answerFormatter.enableLLM()
    const held = answerFormatter.deepEquals
    answerFormatter.enableLLM(false)
    await expect(held('台灣', '日本')).rejects.toThrow('deepEquals is unavailable')
    expect(api.judgeByLLM).not.toHaveBeenCalled()
  })
})

describe('explain 回報觸發的正規化規則', () => {
  afterEach(() => {
    answerFormatter.matchTable = matchTable
  })

  it('normalized 與 format 在全表基準上一致', () => {
    const drifted = baseline.entries
      .filter(entry => answerFormatter.explain(entry.input).normalized !== answerFormatter.format(entry.input))
      .map(entry => entry.input)
    expect(drifted).toEqual([])
  })

  it('steps 依 formatter 順序列出且名稱不依賴 Function.name', () => {
    const { steps } = answerFormatter.explain('x')
    expect(steps.map(step => step.formatter)).toEqual(baseline.formatterOrder)
  })

  it('matchText 命中 fullMatch 時列出整組答案', () => {
    answerFormatter.matchTable = {
      fullMatch: [{ primeText: 'true', matchText: ['○', 'O'] }],
      partialMatch: []
    }
    const result = answerFormatter.explain('○')
    expect(result.normalized).toBe('true')
    expect(result.fullMatch).toEqual({ hitBy: 'matchText', primeText: 'true', matchedText: '○', relatedAnswers: ['true', '○', 'O'] })
  })

  it('輸入 primeText 本身也列出該組答案，標註 hitBy primeText', () => {
    answerFormatter.matchTable = {
      fullMatch: [{ primeText: 'true', matchText: ['○', 'O'] }],
      partialMatch: []
    }
    const result = answerFormatter.explain('true')
    expect(result.normalized).toBe('true')
    expect(result.fullMatch.hitBy).toBe('primeText')
    expect(result.fullMatch.relatedAnswers).toEqual(['true', '○', 'O'])
  })

  it('依序列出多條 partialMatch 命中', () => {
    answerFormatter.matchTable = {
      fullMatch: [],
      partialMatch: [
        { primeText: '苗栗', matchText: ['苗栗縣'] },
        { primeText: '臺灣', matchText: ['台灣'] }
      ]
    }
    const result = answerFormatter.explain('台灣苗栗縣')
    expect(result.normalized).toBe('臺灣苗栗')
    expect(result.fullMatch).toBeNull()
    expect(result.partialMatch.map(hit => [hit.matchedText, hit.primeText, hit.reverted])).toEqual([
      ['苗栗縣', '苗栗', false],
      ['台灣', '臺灣', false]
    ])
    expect(result.partialMatch[1].relatedAnswers).toEqual(['臺灣', '台灣'])
  })

  it('partialMatch 改寫撞上 fullMatch primeText 而還原時標註 reverted', () => {
    answerFormatter.matchTable = {
      fullMatch: [{ primeText: '臺灣', matchText: ['福爾摩沙'] }],
      partialMatch: [{ primeText: '臺灣', matchText: ['台灣'] }]
    }
    const result = answerFormatter.explain('台灣')
    expect(result.normalized).toBe(answerFormatter.format('台灣'))
    expect(result.normalized).toBe('台灣')
    expect(result.partialMatch).toHaveLength(1)
    expect(result.partialMatch[0].reverted).toBe(true)
  })

  it('沒有觸發任何規則時回傳空結果', () => {
    answerFormatter.matchTable = { fullMatch: [], partialMatch: [] }
    const result = answerFormatter.explain('abc')
    expect(result).toMatchObject({ input: 'abc', normalized: 'abc', fullMatch: null, partialMatch: [] })
  })
})

describe('sc-130522 同義詞擴充', () => {
  // 卡片規則先進內建預設表；Sheet 更新、fixture 重抓後兩者一致
  const defaultTable = require('../src/data/matchTable.json')
  const equivalenceBaseline = require('./fixtures/equivalenceBaseline.json')
  const { expected, collectInputs, diffClasses } = require('./fixtures/equivalence')

  beforeEach(() => {
    answerFormatter.matchTable = defaultTable
  })
  afterAll(() => {
    answerFormatter.matchTable = matchTable
  })

  const pairsOf = rows => rows.flatMap(row => row.slice(1).map(text => [row[0], text]))

  it.each(pairsOf(expected.groups))('詞組互通：%s ＝ %s', (a, b) => {
    expect(answerFormatter.equals(a, b)).toBe(true)
  })

  it.each(pairsOf(expected.pairs))('寫法互通：%s ＝ %s', (a, b) => {
    expect(answerFormatter.equals(a, b)).toBe(true)
  })

  it.each(pairsOf(expected.longAnswers))('較長的答案也互通：%s ＝ %s', (a, b) => {
    expect(answerFormatter.equals(a, b)).toBe(true)
  })

  it.each(expected.negatives)('不可互通：%s ≠ %s', (a, b) => {
    expect(answerFormatter.equals(a, b)).toBe(false)
  })

  it('新增的相等都能由 expectedChanges.json 解釋，且沒有由對轉錯', () => {
    const inputs = [...new Set([...equivalenceBaseline.inputs, ...collectInputs(defaultTable)])]
    expect(diffClasses(answerFormatter, equivalenceBaseline.classes, inputs)).toEqual({
      unexpectedMerges: [],
      splits: [],
      negativeHits: []
    })
  })

  it('內建預設表的 fullMatch 每個 matchText 都與其 primeText 判定相等', () => {
    const broken = defaultTable.fullMatch
      .filter(({ primeText, matchText }) => matchText.some(text => !answerFormatter.equals(text, primeText)))
      .map(({ primeText }) => primeText)
    expect(broken).toEqual([])
  })

  it.each([['內建預設表', defaultTable], ['遠端快照', matchTable]])('%s前處理後沒有不同的 fullMatch 群組收斂成同一個 primeText', (_, table) => {
    answerFormatter.matchTable = table
    const primeTextsByOutput = new Map()
    for (const { primeText } of table.fullMatch) {
      const output = answerFormatter.format(primeText)
      primeTextsByOutput.set(output, new Set([...(primeTextsByOutput.get(output) || []), primeText]))
    }
    // 同一個 primeText 重複列（Sheet 上的重複列）結果相同，不算碰撞
    const collisions = [...primeTextsByOutput.values()].filter(set => set.size > 1).map(set => [...set])
    expect(collisions).toEqual([])
  })

  it('variantMatch 之後才撞上 fullMatch primeText 的答案不會被還原', () => {
    const result = answerFormatter.explain('稀有氣體')
    expect(result.normalized).toBe(answerFormatter.format('惰性氣體'))
    expect(result.variantMatch.map(hit => hit.matchedText)).toEqual(['稀有氣體'])
    expect(result.partialMatch.every(hit => !hit.reverted)).toBe(true)
  })

  it('partialMatch 改寫撞上 fullMatch primeText 時仍會還原（宜蘭縣平原）', () => {
    const result = answerFormatter.explain('宜蘭縣平原')
    expect(result.normalized).toBe('宜蘭縣平原')
    expect(result.partialMatch.some(hit => hit.reverted)).toBe(true)
  })
})

describe('yearFormatter / interpunctFormatter / arrowFormatter', () => {
  const byName = name => formatters.find(formatter => formatter.formatterName === name)

  it.each([
    ['1980s', '1980年代'],
    ['1980S', '1980年代'],
    ["1980's", '1980年代'],
    ['1980’s', '1980年代'],
    ['1980s,1990s', '1980年代,1990年代'],
    ['10s', '10s'],
    ['12340s', '12340s'],
    ['1980sec', '1980sec']
  ])('年代：%s → %s', (input, output) => {
    expect(byName('yearFormatter')(input)).toBe(output)
  })

  it.each([
    ['切.格瓦拉', '切·格瓦拉'],
    ['切‧格瓦拉', '切·格瓦拉'],
    ['切・格瓦拉', '切·格瓦拉'],
    ['約翰.Smith', '約翰·Smith'],
    ['3·5', '3·5'],
    ['3.5', '3.5'],
    ['U.S.A', 'U.S.A'],
    ['N·m', 'N·m'],
    ['Freeway No.5', 'Freeway No.5'],
    ['臺灣.', '臺灣.']
  ])('間隔號：%s → %s', (input, output) => {
    expect(byName('interpunctFormatter')(input)).toBe(output)
  })

  it.each([
    ['乙→甲→丁', '乙甲丁'],
    ['乙⟶甲', '乙甲'],
    ['乙->甲', '乙甲'],
    ['$乙→甲$', '乙甲'],
    ['A→B→C', 'ABC'],
    ['12→3', '12→3'],
    ['H2→O2', 'H2→O2'],
    ['2H2+O2→2H2O', '2H2+O2→2H2O'],
    ['乙甲丁', '乙甲丁']
  ])('箭頭：%s → %s', (input, output) => {
    expect(byName('arrowFormatter')(input)).toBe(output)
  })
})

describe('正式機真實作答的回歸（sc-130522）', () => {
  // 114 學年度起 ExamAnswer、UserQuestion 的填充題作答，只含學生答案與標準答案。
  // changed：sc-130522 改動前後判定不同（皆為由錯轉對）；unchanged：判定不變的抽樣。
  // 之後改規則若讓這裡轉紅，代表會改變學生真實作答的批改結果，需逐筆確認
  const defaultTable = require('../src/data/matchTable.json')
  const realAnswers = require('./fixtures/realAnswers.json')
  const judge = ({ student, standards }) => standards.some(standard => answerFormatter.equals(student, standard))

  beforeAll(() => {
    answerFormatter.matchTable = defaultTable
  })
  afterAll(() => {
    answerFormatter.matchTable = matchTable
  })

  it('本卡改動讓這些作答由錯轉對', () => {
    const notFixed = realAnswers.changed.filter(row => judge(row) !== row.after).map(row => [row.student, row.standards])
    expect(notFixed).toEqual([])
  })

  it('判定不變的抽樣作答維持原判定', () => {
    const drifted = realAnswers.unchanged.filter(row => judge(row) !== row.expected).map(row => [row.student, row.standards, row.expected])
    expect(drifted).toEqual([])
  })
})

describe('分科對答規則（sc-126462）', () => {
  const subjectTable = {
    variantMatch: [],
    fullMatch: [{ primeText: '臺灣', matchText: ['福爾摩沙'] }],
    partialMatch: [{ primeText: '臺', matchText: ['台'] }],
    subjects: {
      'E-EN': {
        ignoreCase: true,
        fullMatch: [{ primeText: 'United States', matchText: ['USA', 'U.S.A.'] }]
      },
      'H-CH': {
        fullMatch: [{ primeText: '甲', matchText: ['A'] }],
        partialMatch: [{ primeText: '臺', matchText: ['台'] }]
      },
      'H-GE': {
        fullMatch: [{ primeText: '寶島', matchText: ['福爾摩沙'] }]
      }
    }
  }

  beforeEach(() => {
    answerFormatter.matchTable = subjectTable
  })
  afterEach(() => {
    answerFormatter.matchTable = matchTable
  })

  it('不帶科目時行為與全表基準一致', () => {
    answerFormatter.matchTable = matchTable
    const drifted = baseline.entries
      .filter(entry => !entry.error && answerFormatter.format(entry.input, {}) !== entry.output)
      .map(entry => entry.input)
    expect(drifted).toEqual([])
  })

  it('不帶科目、表上沒有該科或科目為空字串時只套全科通用規則', () => {
    for (const options of [undefined, {}, { subject: '' }, { subject: 'X-XX' }]) {
      expect(answerFormatter.format('福爾摩沙', options)).toBe('臺灣')
      expect(answerFormatter.equals('USA', 'United States', options)).toBe(false)
      expect(answerFormatter.equals('abc', 'ABC', options)).toBe(false)
    }
  })

  it('分科規則只在該科生效', () => {
    expect(answerFormatter.equals('USA', 'United States', { subject: 'E-EN' })).toBe(true)
    expect(answerFormatter.equals('A', '甲', { subject: 'H-CH' })).toBe(true)
    expect(answerFormatter.equals('A', '甲', { subject: 'E-EN' })).toBe(false)
  })

  it('帶科目時全科通用規則仍然生效', () => {
    expect(answerFormatter.format('福爾摩沙', { subject: 'E-EN' })).toBe('臺灣')
    expect(answerFormatter.format('台北', { subject: 'E-EN' })).toBe('臺北')
  })

  it('分科與通用規則重疊時以分科為準', () => {
    expect(answerFormatter.format('福爾摩沙', { subject: 'H-GE' })).toBe('寶島')
    expect(answerFormatter.format('福爾摩沙')).toBe('臺灣')
  })

  it('分科與通用有同一條規則時結果不變', () => {
    expect(answerFormatter.format('台北', { subject: 'H-CH' })).toBe(answerFormatter.format('台北'))
  })

  it('ignoreCase 的科目英文字母不分大小寫，表上寫法也一併比對', () => {
    const options = { subject: 'E-EN' }
    expect(answerFormatter.equals('Apple', 'apple', options)).toBe(true)
    expect(answerFormatter.equals('usa', 'UNITED STATES', options)).toBe(true)
    expect(answerFormatter.equals('u.s.a.', 'United States', options)).toBe(true)
  })

  it('未設定 ignoreCase 的科目維持分大小寫', () => {
    expect(answerFormatter.equals('Apple', 'apple', { subject: 'H-CH' })).toBe(false)
  })

  it('ignoreCase 不轉希臘字母，LaTeX 指令仍能線性化', () => {
    const options = { subject: 'E-EN' }
    expect(answerFormatter.equals('Δ', 'δ', options)).toBe(false)
    expect(answerFormatter.format('\\Delta x', options)).toBe(answerFormatter.format('Δx', options))
  })

  it('explain 回報實際套用的科目與分科規則命中', () => {
    const result = answerFormatter.explain('USA', { subject: 'E-EN' })
    expect(result.subject).toBe('E-EN')
    expect(result.normalized).toBe(answerFormatter.format('USA', { subject: 'E-EN' }))
    expect(result.fullMatch).toMatchObject({ hitBy: 'matchText', primeText: 'United States' })
    expect(result.steps.find(step => step.formatter === 'caseFormatter')).toEqual({ formatter: 'caseFormatter', before: 'USA', after: 'usa' })
    expect(answerFormatter.explain('USA', { subject: 'X-XX' }).subject).toBeNull()
    expect(answerFormatter.explain('USA').subject).toBeNull()
  })

  it('deepEquals 把科目傳給 equals，格式化已相等就不呼叫後端', async () => {
    answerFormatter.enableLLM(true)
    api.judgeByLLM.mockClear()
    try {
      await expect(answerFormatter.deepEquals('USA', 'United States', { subject: 'E-EN' })).resolves.toBe(true)
      expect(api.judgeByLLM).not.toHaveBeenCalled()
    } finally {
      answerFormatter.enableLLM(false)
    }
  })
})

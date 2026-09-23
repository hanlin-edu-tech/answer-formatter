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
      expect(answerFormatter.format(' a b c ')).toContain('abc')
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

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
  })

  describe('removeSpaceFormatter', () => {
    it('should remove spaces and control chars', () => {
      expect(answerFormatter.format(' 甲\u200B乙\t丙 ')).toBe('甲乙丙')
      expect(answerFormatter.format('3 cm')).toBe('3cm')
      expect(answerFormatter.format('x + 1')).toBe('x+1')
      expect(answerFormatter.format(' a  b\tc ')).toBe('abc')
      expect(answerFormatter.equals('1 2', '12')).toBe(true)
    })

    // kb-1005161：標準答案字中有空白（題庫用 U+2009）時，先去空白才命中完整答案對答
    it('標準答案字中有空白時仍比得到同義詞', () => {
      expect(answerFormatter.equals('國道3號', '國道 3 號')).toBe(true)
      expect(answerFormatter.equals('國道 3 號', '國道 3 號')).toBe(true)
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
  // 曾經的缺陷：fullMatch 命中時直接 return primeText，跳過 partialMatch 與排在
  // synonymsFormatter 之前的 formatter，兩條路徑因此分岔：
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
  afterEach(() => {
    answerFormatter.matchTable = matchTable
  })

  it('fullMatch 每個寫法字中插入空白後仍與原寫法相等', () => {
    const broken = []
    for (const { matchText = [] } of matchTable.fullMatch || []) {
      for (const text of matchText) {
        if (text.length < 2 || /\s/.test(text)) continue
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
    expect(answerFormatter.format('FreewayNo.5')).toBe('蔣渭水高速公路')
  })

  it('含空白的 primeText 仍觸發 partialMatch 撞上 fullMatch 時的還原', () => {
    answerFormatter.matchTable = {
      fullMatch: [{ primeText: 'He is not', matchText: ["He isn't"] }],
      partialMatch: [{ primeText: 'He is not', matchText: ['He aint'] }]
    }
    expect(answerFormatter.format('He aint')).toBe('Heaint')
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

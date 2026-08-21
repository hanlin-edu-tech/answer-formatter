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
      // fullMatch 命中時 synonymsFormatter 直接 return primeText，該 primeText
      // 不會再經過 partialMatch，因此比對基準也必須跳過 synonymsFormatter。
      // 這個落差本身是缺陷，由下方「fullMatch 的 primeText 遭 partialMatch 污染」記錄。
      const synonymsIndex = formatters.findIndex(f => f.name === 'synonymsFormatter')
      const __formatPrime = (primeText) => {
        let result = primeText
        for (let i = synonymsIndex + 1; i < formatters.length; i++) {
          result = formatters[i](result)
        }
        return result
      }
      for (const { primeText, matchText } of matchTable.fullMatch) {
        expect(answerFormatter.format(matchText[0])).toBe(__formatPrime(primeText))
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

describe('fullMatch 的 primeText 遭 partialMatch 污染', () => {
  // partialMatch 的「一 -> ㄧ」「沙 -> 砂」會改寫 fullMatch primeText 的內部字元，
  // 而 fullMatch 命中時是直接 return primeText、不再經 partialMatch，兩條路徑因此分岔：
  //   format('一戰')           -> '第一次世界大戰'（fullMatch return，未經 partialMatch）
  //   format('第一次世界大戰') -> '第ㄧ次世界大戰'（走 partialMatch，漢字一被換成注音ㄧ）
  // 結果是答同義詞的學生會被判錯。以下鎖住目前受影響的範圍，修好後這裡會轉為 0。
  const BROKEN_GROUP_COUNT = 14

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

  it.failing('fullMatch 的每個 matchText 都應與其 primeText 判定相等', () => {
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

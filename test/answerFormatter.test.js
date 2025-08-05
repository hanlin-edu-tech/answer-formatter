
const api = require('../src/libs/api')
const formatters = require('../src/libs/formatters')

let matchTable
let answerFormatter

beforeAll(async () => {
  matchTable = await api.getMatchTable()
  answerFormatter = {
    matchTable,
    format(answer) {
      let result = answer
      for (let i = 0; i < formatters.length; i++) {
        result = formatters[i](result, answerFormatter)
      }
      return result
    },
    equals(answer1, answer2) {
      return answerFormatter.format(answer1) == answerFormatter.format(answer2)
    }
  }
})

describe('answerFormatter', () => {
  describe('toStringFormatter', () => {
    it('should convert value to string', () => {
      expect(answerFormatter.format(123)).toContain('123')
    })
  })

  describe('latexFormatter', () => {
    it('should remove \\ and latex patterns', () => {
      expect(answerFormatter.format('\\ x')).toBe('x')
      expect(answerFormatter.format('{ }')).toBe('')
      expect(answerFormatter.format('₁₂₃')).toBe('_1_2_3')
    })
  })

  describe('toLowerCaseFormatter', () => {
    it('should convert to lowercase', () => {
      expect(answerFormatter.format('ABC')).toContain('abc')
    })
  })

  describe('fullwidthFormatter', () => {
    it('should convert fullwidth to halfwidth', () => {
      expect(answerFormatter.format('ＡＢＣ１２３')).toContain('abc123')
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

  describe('numberFormatter', () => {
    it('should remove number separators', () => {
      expect(answerFormatter.format('1,234')).toContain('1234')
      expect(answerFormatter.format('1，234')).toContain('1234')
      expect(answerFormatter.format('1‚234')).toContain('1234')
    })
  })

  describe('phoneticFormatter', () => {
    it('should transform phonㄚetic symbols', () => {
      expect(answerFormatter.format('ㄧㄚ•ㄅ')).toBe('一丫˙ㄅ')
      expect(answerFormatter.format('ˉㄅ')).toBe('ㄅ')
    })
  })

  describe('synonymsFormatter', () => {
    it('should replace synonyms', () => {
      expect(answerFormatter.format('關聯')).toBe('關連')
      expect(answerFormatter.format('花崗')).toBe('花岡')
      expect(answerFormatter.format('台江')).toBe('臺江')
      expect(answerFormatter.format('台灣')).toBe('臺灣')
      expect(answerFormatter.format('台北')).toBe('臺北')
      expect(answerFormatter.format('台東')).toBe('臺東')
      expect(answerFormatter.format('台西')).toBe('臺西')
      expect(answerFormatter.format('台南')).toBe('臺南')
      expect(answerFormatter.format('台中')).toBe('臺中')
      expect(answerFormatter.format('西台')).toBe('西臺')
      expect(answerFormatter.format('中正國際機場')).toBe('桃園國際機場')
      expect(answerFormatter.format('中正機場')).toBe('桃園國際機場')
      expect(answerFormatter.format('桃園機場')).toBe('桃園國際機場')
      expect(answerFormatter.format('臺灣桃園國際機場')).toBe('桃園國際機場')
      expect(answerFormatter.format('渡台禁令')).toBe('渡臺禁令')
      expect(answerFormatter.format('劃')).toBe('畫')
      expect(answerFormatter.format('窰')).toBe('窯')
      expect(answerFormatter.format('窑')).toBe('窯')
      expect(answerFormatter.format('姊')).toBe('姐')
      expect(answerFormatter.format('啓')).toBe('啟')
      expect(answerFormatter.format('荐')).toBe('薦')
      expect(answerFormatter.format('簔')).toBe('簑')
      expect(answerFormatter.format('污')).toBe('汙')
      expect(answerFormatter.format('砂')).toBe('沙')
    })
  })

  describe('symbolFormatter', () => {
    it('should replace symbols', () => {
      expect(answerFormatter.format('1,234')).toBe('1234')
      expect(answerFormatter.format('’')).toBe("'")
      expect(answerFormatter.format('＝')).toBe('=')
      expect(answerFormatter.format('《text》')).toBe('text')
    })
  })

  describe('booleanFormatter', () => {
    it('should format booleans', () => {
      expect(answerFormatter.format('O')).toBe('true')
      expect(answerFormatter.format('╳')).toBe('false')
      expect(answerFormatter.format('true')).toBe('true')
      expect(answerFormatter.format('false')).toBe('false')
    })
  })

  describe('equals', () => {
    it('should compare formatted answers correctly', () => {
      expect(answerFormatter.equals('台灣', '臺灣')).toBe(true)
      expect(answerFormatter.equals('O', 'true')).toBe(true)
      expect(answerFormatter.equals('╳', 'false')).toBe(true)
      expect(answerFormatter.equals('1,234', '1234')).toBe(true)
      expect(answerFormatter.equals('《text》', 'text')).toBe(true)
      expect(answerFormatter.equals('啓', '啟')).toBe(true)
      expect(answerFormatter.equals('姊', '姐')).toBe(true)
      expect(answerFormatter.equals('污', '汙')).toBe(true)
      expect(answerFormatter.equals('砂', '沙')).toBe(true)
      expect(answerFormatter.equals('1，234', '1234')).toBe(true)
      expect(answerFormatter.equals('1‚234', '1234')).toBe(true)
      expect(answerFormatter.equals('’', "'")).toBe(true)
      expect(answerFormatter.equals('＝', '=' )).toBe(true)
      expect(answerFormatter.equals('\\ x', 'x')).toBe(true)
    })
  })
})

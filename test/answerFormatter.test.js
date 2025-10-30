
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

  describe('fullwidthFormatter', () => {
    it('should convert fullwidth to halfwidth', () => {
      expect(answerFormatter.format('ＡｂＣ１２３')).toContain('AbC123')
    })
  })

  // describe('toLowerCaseFormatter', () => {
  //   it('should convert to lowercase', () => {
  //     expect(answerFormatter.format('AbC')).toContain('abc')
  //   })
  // })

  describe('synonymsFormatter', () => {
    it('should replace synonyms', () => {
      const __formatPrime = (primeText) => {
        let result = primeText
        for (let i = 3; i < formatters.length; i++) {
          result = formatters[i](result)
        }
        return result
      }
      for (const { primeText, matchText } of answerFormatter.matchTable.fullMatch) {
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

  // describe('numberFormatter', () => {
  //   it('should remove number separators', () => {
  //     expect(answerFormatter.format('1,234')).toContain('1234')
  //     expect(answerFormatter.format('1，234')).toContain('1234')
  //     expect(answerFormatter.format('1‚234')).toContain('1234')
  //   })
  // })

  describe('phoneticFormatter', () => {
    it('should transform phonㄚetic symbols', () => {
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
      expect(answerFormatter.equals('＝', '=' )).toBe(true)
      expect(answerFormatter.equals('\\ x', 'x')).toBe(true)
    })
  })
})

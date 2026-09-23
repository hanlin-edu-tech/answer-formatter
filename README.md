## Usage

```js
const answerFormatter = require('answer-formatter')
// 瀏覽器：載入 UMD 後使用 window.answerFormatter，並會自動從 S3 更新同義詞匹配表
```

| API | 說明 |
| --- | --- |
| `format(answer)` | 同步格式化，回傳正規化後的答案 |
| `equals(answer1, answer2)` | 兩個答案格式化後是否相同 |
| `explain(answer)` | 與 `format` 走同一條流程，回報答案觸發了哪些正規化規則 |
| `linearizeLatex(answer)` | 只把 LaTeX 寫法線性化成純文字 |
| `updateMatchTable()` | 重新下載同義詞匹配表 |
| `enableLLM(enabled = true)` | 開關 LLM 語義判斷；開啟後才掛載 `deepEquals(answer1, answer2)` |

### 空白處理

- 英文字母之間的空白保留一個（多個空白縮成一個）：`a part` 與 `apart`、`x y` 與 `xy` 判定不相等
- 其餘空白一律刪除：中文字之間（`一 戰` 等於 `一戰`）、數字與單位之間（`3 cm` 等於 `3cm`）、標點旁
- 同義詞比對前就整理空白，匹配表上的寫法也以同樣規則整理後再比對

### explain(answer)

回傳答案觸發的正規化規則，並列出命中的「完整答案對答（fullMatch）」與「部分答案對答（partialMatch）」群組中的所有相關答案。

```js
answerFormatter.explain('一戰')
// {
//   input: '一戰',
//   normalized: '第ㄧ次世界大戰',          // 與 format('一戰') 相同
//   fullMatch: {
//     hitBy: 'matchText',                // 'matchText'：輸入是群組內的替代寫法；'primeText'：輸入即標準答案
//     primeText: '第一次世界大戰',
//     matchedText: '一戰',
//     relatedAnswers: ['第一次世界大戰', '一次世界大戰', 'WW1', '第1次世界大戰', '一戰', '1次世界大戰']
//   },
//   partialMatch: [
//     { primeText: 'ㄧ', matchedText: '一', before: '第一次世界大戰', after: '第ㄧ次世界大戰', relatedAnswers: ['ㄧ', '一'], reverted: false }
//   ],
//   steps: [
//     { formatter: 'toStringFormatter', before: '一戰', after: '一戰' },
//     // ...依序列出每個 formatter 的前後變化
//   ]
// }
```

| 欄位 | 說明 |
| --- | --- |
| `normalized` | 正規化結果，恆與 `format(answer)` 相同 |
| `fullMatch` | 命中的完整答案對答群組；沒命中為 `null`。fullMatch 比對的是經全形轉半形與 LaTeX 線性化後的字串 |
| `fullMatch.hitBy` | `matchText` 會改寫成 primeText；`primeText` 表示輸入本身就是標準答案，不改寫但仍列出群組 |
| `partialMatch` | 依觸發順序列出每條命中的部分答案對答規則；可同時命中多條，fullMatch 命中後的 primeText 也會再跑 partialMatch |
| `partialMatch[].reverted` | `true` 表示改寫結果撞上某個 fullMatch 的 primeText 而被還原，實際未生效 |
| `relatedAnswers` | 該群組 primeText 與所有 matchText；primeText 為空字串的刪除規則（如 `《`）不列入空字串 |
| `steps` | 每個 formatter 的輸入與輸出，用來判斷是哪一步造成命中 |

## 本機測試頁

```sh
npm run build
python3 -m http.server 8000
# 開啟 http://localhost:8000/test/index.html
```

## Deploy

```sh
cp src/answer-formatter.js lib/answer-formatter.js
browserify src/answer-formatter.js -o lib/answer-formatter-all.js
minify lib/answer-formatter-all.js -o lib/answer-formatter-all.min.js
minify lib/answer-formatter.js -o lib/answer-formatter.min.js

npm publish
```

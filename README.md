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
| `fullMatch` | 命中的完整答案對答群組；沒命中為 `null`。fullMatch 比對的是經全形轉半形、LaTeX 線性化與空白整理後的字串 |
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
git checkout -- dist   # dist/ 有進版控，測完還原，避免把 dev build 一起提交
```

## Deploy

推 tag 觸發 GitHub Actions（`.github/workflows/`）建置並上傳：

| tag | 部署目標 |
| --- | --- |
| `X.Y.Z-SNAPSHOT` | SDK → 測試 S3 `tw-itembank-sandbox/v1/api/answerFormatter/{X.Y.Z,latest}/answerFormatter.js` |
| `X.Y.Z` | SDK → 正式 S3 `tw-itembank/v1/api/answerFormatter/{X.Y.Z,latest}/answerFormatter.js` |
| `scripts/X.Y.Z-SNAPSHOT` | 後端（`scripts/`）→ 測試 Cloud Run `answer-formatter-script` |
| `scripts/X.Y.Z` | 後端（`scripts/`）→ 正式 Cloud Run `answer-formatter-script` |

```sh
git tag <版本>-SNAPSHOT && git push origin <版本>-SNAPSHOT   # 版本接續 git tag 最新一個
```

手動部署 SDK（需本機 AWS 權限；版本目錄固定為 `0.0.0`，另覆蓋 `latest`）：

```sh
npm run deploy-test   # 測試
npm run deploy-prod   # 正式
```

發布 npm 套件：`npm publish`（`prepare` 會先跑 `build-prod`）。

手動部署後端（`scripts/` 的 tag workflow 尚無執行紀錄，後端目前是手動部署；需本機 gcloud 權限）：

```sh
cd scripts
npm run docker -- -v <版本>        # 建置 image（正式用 docker-prod）；docker.sh 內的 push 已註解，需自行推送
gcloud auth configure-docker asia-east1-docker.pkg.dev
docker push asia-east1-docker.pkg.dev/tutor-test-238709/answer-formatter/script:latest-SNAPSHOT   # 正式：tutor-204108/…:latest
npm run cloudrun                   # 部署 Cloud Run（正式用 cloudrun-prod）
```

### 更新同義詞匹配表

匹配表維護在 Google Sheet（partialMatch / fullMatch 兩個分頁），由後端轉成 JSON 上傳 S3 並清 CloudFront 快取：

```sh
curl -X POST https://answer-formatter-script-184800465453.asia-east1.run.app/match-table   # 測試
curl -X POST https://answer-formatter-script-613393819622.asia-east1.run.app/match-table   # 正式
```

partialMatch 依表格列的順序套用，每條規則取最長的相符寫法替換；新增規則時要注意與既有規則的先後（例：`公里/小時` 須排在 `公里` 之前）。

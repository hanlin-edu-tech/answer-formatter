## Usage

```js
const answerFormatter = require('answer-formatter')
// 瀏覽器：載入 UMD 後使用 window.answerFormatter，並會自動從 S3 更新同義詞匹配表
```

| API | 說明 |
| --- | --- |
| `format(answer, options?)` | 同步格式化，回傳正規化後的答案 |
| `equals(answer1, answer2, options?)` | 兩個答案格式化後是否相同 |
| `explain(answer, options?)` | 與 `format` 走同一條流程，回報答案觸發了哪些正規化規則 |
| `linearizeLatex(answer)` | 只把 LaTeX 寫法線性化成純文字 |
| `updateMatchTable()` | 重新下載同義詞匹配表 |
| `enableLLM(enabled = true)` | 開關 LLM 語義判斷；開啟後才掛載 `deepEquals(answer1, answer2, options?)` |

`options.subject` 為科目名稱（與對答表、設定表的科目欄一致，例：`'英文'`），不帶時套用所有規則列與全科開關。

### 分科對答規則

```js
answerFormatter.equals('USA', 'United States', { subject: '英文' })
```

- 完整／部分答案對答表的每一列勾選套用的科目；帶科目時只套用勾了該科的列。fullMatch 照表上的列順序取第一個命中；partialMatch 與列順序無關（見「更新同義詞匹配表」）
- 不帶科目、或帶了表上沒有的科目時，套用所有 enabled 的列，`explain()` 回傳的 `subject` 為 `null`，可用來確認分科是否真的套用
- 要執行哪些 formatter 由設定表的開關決定，見下節

對答分頁的格式（後端環境變數 `FORMAT_RULE_SHEET_GID_FULL_MATCH`、`FORMAT_RULE_SHEET_GID_PARTIAL_MATCH` 指定 gid）：第一列為表頭，「標準答案」之前是 `enabled` 與各科勾選欄，之後是輸入答案。`enabled` 為 FALSE 的列不輸出；`reload` 欄忽略。沒有「標準答案」表頭的分頁視為舊格式（第一欄標準答案、不分科）。

| reload | enabled | 國文 | 英文 | 數學 | 自然 | 社會 | 標準答案 | 輸入答案 | |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | TRUE | TRUE | TRUE | TRUE | TRUE | TRUE | 第一次世界大戰 | 一戰 | WW1 |
| | TRUE | TRUE | FALSE | TRUE | TRUE | TRUE | is not | isn't | |

後端轉成 `matchTable.v2.json`：規則列只在部分勾選時帶 `subjects`，`ruleSubjects` 為表上的科目欄；`formatters`／`subjects` 為設定表的開關。`matchTable.json`（v1，給舊版 SDK）不帶科目資訊，輸出所有 enabled 的列：

```json
{
  "variantMatch": [],
  "fullMatch": [
    { "primeText": "第一次世界大戰", "matchText": ["一戰", "WW1"] },
    { "primeText": "is not", "matchText": ["isn't"], "subjects": ["國文", "數學", "自然", "社會"] }
  ],
  "partialMatch": [],
  "ruleSubjects": ["國文", "英文", "數學", "自然", "社會"],
  "formatters": { "caseFormatter": false },
  "subjects": { "國文": { "formatters": { "caseFormatter": true } } }
}
```

### formatter 開關

formatter 的執行順序固定在程式（順序有前後依賴，例如 LaTeX 要先轉純文字才能轉小寫、同義詞比對前要先整理空白），表上只決定每個 formatter 開或關：

- 該科有 `subjects[科目].formatters`（即使是空物件）就只用它，沒寫到的 formatter 照程式預設；沒有時才退回全科的 `formatters`。全科只是找不到該科設定時的 fallback，不會疊加到有設定的科目上
- 可開關的 formatter：`fullwidthFormatter`、`latexFormatter`、`caseFormatter`（預設關閉，開啟後英文字母 A-Z 不分大小寫，希臘字母不轉）、`removeSpaceFormatter`、`removeNumberingFormatter`（預設關閉，開啟後刪除開頭、後面接英文字的題號：`①apple` 等於 `apple`；`②`、`①ˇ` 這類題號本身是答案的不刪）、`yearFormatter`、`interpunctFormatter`、`arrowFormatter`、`removeTailPeriodFormatter`、`numberFormatter`（預設關閉，開啟後刪除千分位逗號：`12,345` 等於 `12345`，只刪後面恰好接 3 位數字的逗號，`(4,8)` 不受影響）、`phoneticFormatter`；除了標明預設關閉的，其餘預設開啟
- `fullwidthFormatter` 的細項（預設皆開啟）：`fullwidthAlnum`（英數與冒號）、`fullwidthSpace`（全形空白）、`fullwidthComma`（逗號）、`fullwidthBracket`（括號）、`fullwidthSlash`（斜線）；其他全形符號（`＝`、`％`…）一律轉半形
- `removeSpaceFormatter` 的細項，見下方「空白處理」
- `toStringFormatter`、`synonymsFormatter` 一律執行；某科不想套同義詞就讓該科規則表為空
- 不認得的名稱或非布林值會被忽略
- 同義詞以前的 formatter 與細項開關，表上的寫法也照同樣設定處理，比對前後一致
- `explain()` 的 `steps` 列出所有 formatter，關閉的標 `enabled: false`

開關維護在 Sheet 的「設定表」分頁，由後端環境變數 `FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS` 指定 gid（未設定時不產生開關，全照程式預設）。第一欄為規則名稱（沿用編輯規則表的說法），第一列為科目；格子為勾選框（`TRUE` / `FALSE`，也接受 `Y` / `N`），空白表示照程式預設。每一科一欄完整設定，沒列出的科目用「全科」那一欄：

| 規則名稱 | 全科 | 國文 | 英文 |
| --- | --- | --- | --- |
| 大小寫互通 | FALSE | TRUE | FALSE |
| 國字中間不會去空白 | TRUE | FALSE | TRUE |

規則名稱與 SDK 開關的對照見 `scripts/libs/formatterSettings.js` 的 `RULE_SWITCHES`（比對時忽略空白）；規則名稱寫錯、格子不是 TRUE / FALSE / 空白、規則或科目重複時，後端 job 會失敗且不上傳。

文字替換（書名號、頓號、`$`、國字數字、大寫英文括號…）不放在設定表，維護在完整／部分答案對答表；只有某科要用的放該科的分科表。

#### 規則表（範例檢查）

「規則表」分頁每一列是一條規則的範例：第一欄規則名稱、第二欄標準寫法、其後為其他寫法。由後端環境變數 `FORMAT_RULE_SHEET_GID_RULE_EXAMPLES` 指定 gid；設定後 job 上傳前會下載 S3 上目前發布的 SDK（`latest`），在全科設定下把該規則打開檢查：

- 其他寫法與標準寫法應判定相等；保留空白類的規則（數字／國字／英文中間不會去空白）開啟時應判定不相等
- 有不符就失敗、不上傳，錯誤訊息列出是哪一列
- 把規則關掉後結果不變的範例沒有展示到這條規則，只列在回應的 `warnings`，不擋上傳

### 空白處理

開頭的空白依第一個字、中間的空白依兩側字元，由細項開關決定（預設等於下表）：

| 位置 | 開關 | 預設 |
| --- | --- | --- |
| 開頭，第一個字是數字／國字／英文 | `trimLeadingDigit`／`trimLeadingHan`／`trimLeadingLatin` | 去掉 |
| 中間，兩側都是數字 | `keepDigitSpace` | 去掉（`1 2 3` 等於 `123`） |
| 中間，兩側都是國字 | `keepHanSpace` | 去掉（`一 戰` 等於 `一戰`） |
| 中間，兩側都是英文字母 | `keepLatinSpace` | 保留一個（`a part` 與 `apart` 不相等） |

- 保留時多個空白縮成一個；其他組合（數字與單位之間 `3 cm`、標點旁）與結尾空白一律去掉
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

推 tag 觸發建置並上傳（SDK 走 GitHub Actions `.github/workflows/`，測試機後端走 Cloud Build）：

| tag | 部署目標 |
| --- | --- |
| `X.Y.Z-SNAPSHOT` | SDK → 測試 S3 `tw-itembank-sandbox/v1/api/answerFormatter/{X.Y.Z,latest}/answerFormatter.js` |
| `X.Y.Z` | SDK → 正式 S3 `tw-itembank/v1/api/answerFormatter/{X.Y.Z,latest}/answerFormatter.js` |
| `scripts/X.Y.Z-SNAPSHOT` | 後端（`scripts/`）→ 測試 Cloud Run `answer-formatter-script`（Cloud Build trigger `answer-formatter-script-test`，設定檔 `scripts/cloudbuild.test.yaml`） |
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

測試機後端的 AWS 金鑰存在 `tutor-test-238709` 的 Secret Manager（`answer-formatter-aws-access-key`、`answer-formatter-aws-secret-key`），部署時掛成 Cloud Run 環境變數，不打包進 image。

手動部署後端（正式機的 tag workflow 尚無執行紀錄，正式機後端目前是手動部署；需本機 gcloud 權限）：

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

partialMatch 的套用與表上列順序無關（sc-134172）：

- 由左而右掃描答案，每個位置取最長的輸入答案替換（同一列的多個輸入答案在同一個答案裡都會替換）
- 掃完一輪若有改寫就再掃一輪，直到不再變動，前一條的結果可接著被下一條改寫（例：`攝氏` → `°C` → `度C`）
- 標準答案含有自己輸入答案的擴寫規則（例：`中國國民黨` ← `國民黨`）不會重複擴寫
- 規則彼此改來改去而不會收斂時（例：`劃` ← `畫` 與 `計畫` ← `計劃`），job 失敗、不上傳，錯誤訊息列出循環的寫法

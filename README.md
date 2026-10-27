## Usage

```js
const answerFormatter = require('answer-formatter')
// 瀏覽器：載入 UMD 後使用 window.answerFormatter，並會自動從 S3 更新同義詞匹配表
```

| API | 說明 |
| --- | --- |
| `format(answer, options?)` | 同步格式化，回傳正規化後的答案 |
| `equals(answer1, answer2, options?)` | 比較兩個答案，**answer1 放標準答案**；數學科另支援多答案順序互換、`±` 展開與括號因式順序互換；「多個答案順序可互換」的頓號規則見下方 |
| `explain(answer, options?)` | 與 `format` 走同一條流程，回報答案觸發了哪些正規化規則 |
| `subjectOf(subject)` | 回報帶這個科目名稱或總庫科目代碼時，實際套用的科目（同 `explain().subject`） |
| `linearizeLatex(answer)` | 只把 LaTeX 寫法線性化成純文字 |
| `updateMatchTable()` | 重新下載同義詞匹配表 |
| `enableLLM(enabled = true)` | 開關 LLM 語義判斷；開啟後才掛載 `deepEquals(answer1, answer2, options?)` |

`options.subject` 為科目名稱（與對答表、設定表的科目欄一致，例：`'英文'`），不帶時套用所有規則列與全科開關。也可以直接傳總庫科目代碼（例：`'J-MA'`），SDK 依內建對照表（`src/libs/subjects.js`）轉成國英數自社；多個代碼可傳陣列或逗號分隔字串，取第一個對應得到的。對應不到的代碼（生活、健體、藝術…）視同不帶科目。`subjectOf(subject)` 回報實際套用的科目，對應不到時回傳 `null`。

依設定表開啟時，英文 formatter 會忽略答案最外層一組成對引號，字內撇號仍保留；外層括號 formatter 只略過包住整串答案的一對括號，座標 tuple 保留。國文、數學設定可將頂層以頓號、逗號或「或」分開的答案視為順序不拘；數學另可展開 `±`、交換完整相鄰括號因式順序。這些答案結構規則在 `format()` 的最後一步執行：多個答案標準化後排序，以「、」接成一串（例：數學 `5或-3` → `-3、5`、`±3` → `-3、3`、`(x-2)(x+1)` → `(x+1)(x-2)`）。`equals()` 就是比對兩邊 `format()` 的結果，兩者走同一套規則；只有帶 `subject: '國文'` 或 `'數學'` 時才會套用。

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

### 頓號可有可無（多個答案順序可互換開著的科目，kb-1005287）

| 標準答案 | 學生答案 | 結果 |
| --- | --- | --- |
| `甲、乙` | `乙、甲`、`甲乙`、`乙甲` | 相等：標準答案帶頓號，確定是多個答案，不帶頓號時任意順序接起來都算 |
| `國父`、`甲乙` | `國、父`、`甲、乙` | 不相等：標準答案沒有頓號時分不出是不能拆的詞還是多個答案 |
| `三民主義` | `民族、民權、民生` | 相等：完整答案對答表明寫的寫法照表算，只認表上的順序 |

- 不帶頓號的比對靠對答表「刪除頓號」的列；這種相等無法化成同一個 `format()` 字串，只有 `equals()` 會套用，兩個參數也不對稱，第一個要放標準答案
- 轉檔的規則生效檢查對刪除類的列（標準寫法空白）兩個方向都試，任一個相等就算生效

### formatter 開關

formatter 的執行順序固定在程式（順序有前後依賴，例如 LaTeX 要先轉純文字才能轉小寫、同義詞比對前要先整理空白），表上只決定每個 formatter 開或關：

- 開關依序合併程式預設、設定表「預設」欄、科目欄位；科目值覆蓋「預設」，「預設」覆蓋程式預設。空白值沿用較低優先層
- 可開關的 formatter：`fullwidthFormatter`、`latexFormatter`、`caseFormatter`（預設關閉，開啟後英文字母 A-Z 不分大小寫，希臘字母不轉）、`removeSpaceFormatter`、`removeNumberingFormatter`（預設關閉，開啟後刪除開頭、後面接英文字的題號：`①apple` 等於 `apple`；`②`、`①ˇ` 這類題號本身是答案的不刪）、`yearFormatter`、`interpunctFormatter`、`arrowFormatter`、`removeTailPeriodFormatter`、`numberFormatter`（預設關閉，開啟後刪除千分位逗號：`12,345` 等於 `12345`，只刪後面恰好接 3 位數字的逗號，`(4,8)` 不受影響）、`phoneticFormatter`、`outerQuoteOptional`（僅英文答案，預設關閉）、`outerBracketOptional`（預設關閉，只略過完整答案外的一對括號，座標 tuple 保留）、`answerOrder`（國文與數學專用，預設開啟）、`mathPlusMinus`、`mathFactorOrder`（數學專用，預設開啟）；除了標明預設關閉的，其餘預設開啟
- `fullwidthFormatter` 的細項：`fullwidthAlnum`（英數與冒號）、`fullwidthSpace`（全形空白）、`fullwidthComma`（逗號）、`fullwidthBracket`（括號）預設開啟；`fullwidthSlash`（斜線）預設關閉，依科目設定轉換；其他全形符號（`＝`、`％`…）一律轉半形
- `fullwidthSpace` 關閉時只有答案中間的全形空白和半形空白不同（`丁　木質部` 不等於 `丁 木質部`），開頭、結尾的全形空白照樣去掉。作答頁小鍵盤送出時已把全形空白轉成半形，所以這條開關只對沒有小鍵盤、直接輸入的科目有作用
- `removeSpaceFormatter` 的細項，見下方「空白處理」
- `toStringFormatter`、`synonymsFormatter` 一律執行；某科不想套同義詞就讓該科規則表為空
- 沒有或不認得的規則ID、非布林值、重複規則或重複科目會讓設定表解析失敗，避免錯誤設定被上傳
- 同義詞以前的 formatter 與細項開關，表上的寫法也照同樣設定處理，比對前後一致
- `explain()` 的 `steps` 列出所有 formatter，關閉的標 `enabled: false`

開關維護在 Sheet 的「設定表」分頁，由後端環境變數 `FORMAT_RULE_SHEET_GID_FORMATTER_SETTINGS` 指定 gid（未設定時只用程式預設）。表頭有兩列：第 1 列英文鍵給程式讀，第 2 列中文說明給人看（編輯可自由改，程式略過），資料從第 3 列起。英文鍵為 `RULE_NAME`（規則名稱）、`RULE_ID`（規則ID）、`DEFAULT`（預設）與科目代碼（`PC` 國文、`EN` 英文、`MA` 數學、`NA` 自然、`SO` 社會），轉檔時換成中文科目名稱，SDK 的科目維持中文；新增科目要先在 `scripts/libs/formatterSettings.js` 的 `HEADER_KEYS` 加代碼，不認得的英文鍵會讓 job 失敗。第 1 列沒有 `RULE_NAME` 時視為舊的單列中文表頭（「規則名稱」「規則ID」與中文科目名稱）。格子為勾選框（`TRUE` / `FALSE`，也接受 `Y` / `N`）。科目欄空白時先用「預設」欄，該欄也空白時才用程式預設。沒有科目欄設定時，以「全科」或「預設」欄作為 fallback：

| RULE_NAME | RULE_ID | DEFAULT | PC | EN |
| --- | --- | --- | --- | --- |
| 規則名稱 | 規則ID（程式讀取用） | 預設 | 國文 | 英文 |
| 大小寫互通 | caseFormatter | FALSE | TRUE | FALSE |
| 國字中間的空白會去掉 | removeHanSpace | FALSE | TRUE | FALSE |

「規則ID」必填，值為 SDK 開關名稱（`scripts/libs/formatterSettings.js` 的 `RULE_IDS`）；程式只以 ID 比對，規則名稱只用在錯誤訊息，編輯可以自由改名或留空。建議在 Sheet 把第 1 列與 ID 欄設成保護範圍，ID 欄設下拉選單。欄位依表頭文字找，不限放在第幾欄；空白列略過，錯誤訊息的列號為 Sheet 上的列號。沒有規則ID欄、規則ID空白或寫錯、英文鍵下面不是中文說明列（說明列被刪掉，第一條規則跑到第 2 列）、格子不是 TRUE / FALSE / 空白、規則或科目重複時，後端 job 會失敗且不上傳。

文字替換（書名號、頓號、`$`、國字數字、大寫英文括號…）不放在設定表，維護在完整／部分答案對答表；只有某科要用的放該科的分科表。

#### 範例檢查

範例和開關放在同一張設定表：英文鍵 `STANDARD` 標準寫法、`INPUT` 輸入答案、`DISPLAY` 對答呈現三欄放在各科欄後面，解析開關時略過。每一列的範例屬於該列的規則；還沒寫範例的規則只列為警告。job 上傳前會下載 S3 上目前發布的 SDK（`latest`），在全科設定下把該規則打開檢查：

- 其他寫法與標準寫法應判定相等；保留空白類的規則（數字／國字／英文中間不會去空白）開啟時應判定不相等
- 有不符就失敗、不上傳，錯誤訊息列出是哪一列
- 把規則關掉後結果不變的範例沒有展示到這條規則，只列在回應的 `warnings`，不擋上傳；結果不變是因為完整／部分答案對答表已經把兩種寫法換成一樣時（例：部分答案對答 `,` ← `，` 讓全形逗號開關沒有作用），提醒會指出是哪張表的哪個寫法

#### 規則生效檢查

job 上傳前也會用同一份 SDK 檢查完整／部分答案對答表的每一列是否真的生效：在勾選的每個科目（與不帶科目）下，每個輸入答案應與標準答案判定相等，部分對答另檢查放進較長答案時也相等。不相等的列（例：部分對答把 `無煙囪產業` 改寫成 `觀光業` 後撞上完整對答的標準答案而被還原）列在回應的 `warnings`，不擋上傳；SDK 載入失敗時略過此檢查並列入 `warnings`。每則提醒下面附上學生寫法與標準答案各自的處理過程：一個步驟一行，寫出是哪條規則或哪張對答表、把什麼換成什麼，最後一行是實際拿來比對的值。「多個答案順序可互換」這類答案結構規則會回頭拿原答案拆成多個答案，提醒會寫明前面步驟的結果沒有用上，並照原答案的順序列出拆出來的答案。

### 空白處理

開頭的空白依第一個字、中間的空白依兩側字元，由細項開關決定：

| 位置 | SDK 開關 | 設定表規則ID（勾選＝） |
| --- | --- | --- |
| 開頭，第一個字是數字／國字／英文 | `trimLeadingDigit`／`trimLeadingHan`／`trimLeadingLatin` | 同名（去掉） |
| 中間，兩側都是數字 | `keepDigitSpace` | `removeDigitSpace`（去掉，`1 2 3` 等於 `123`） |
| 中間，兩側都是國字 | `keepHanSpace` | `removeHanSpace`（去掉，`一 戰` 等於 `一戰`） |
| 中間，兩側都是英文字母 | `keepLatinSpace` | `removeLatinSpace`（去掉，`a part` 等於 `apart`） |

- 設定表上中間空白三條用正面說法（勾選＝空白會去掉），轉檔時反轉成 SDK 的 `keep*` 開關寫進 matchTable，舊版 SDK 讀到的設定不變。表上還是舊的 `keep*` ID 時照舊解析（勾選＝保留），並列為警告提醒改用新 ID；新舊 ID 同時出現視為重複

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

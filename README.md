## Usage

```js
const answerFormatter = require('answer-formatter')
// 瀏覽器：載入 UMD 後使用 window.answerFormatter，並會自動從 S3 更新同義詞匹配表
```

| API | 說明 |
| --- | --- |
| `format(answer, options?)` | 同步格式化，回傳正規化後的答案 |
| `equals(answer1, answer2, options?)` | 比較兩個答案，**answer1 放標準答案**；多個答案的順序、分隔號、`±` 展開與括號因式依各科開關，見「多個答案與分隔號」 |
| `explain(answer, options?)` | 與 `format` 走同一條流程，回報答案觸發了哪些正規化規則 |
| `subjectOf(subject)` | 回報帶這個科目名稱或總庫科目代碼時，實際套用的科目（同 `explain().subject`） |
| `linearizeLatex(answer)` | 只把 LaTeX 寫法線性化成純文字 |
| `updateMatchTable()` | 重新下載同義詞匹配表，回傳是否換上了遠端表；S3、CloudFront 都抓不到時保留目前的表（未曾更新過就是內建表），可放心定期呼叫 |
| `enableLLM(enabled = true)` | 開關 LLM 語義判斷；開啟後才掛載 `deepEquals(answer1, answer2, options?)` |

`options.subject` 為科目名稱（與對答表、設定表的科目欄一致，例：`'英文'`），不帶時套用所有規則列與全科開關。也可以直接傳總庫科目代碼（例：`'J-MA'`），SDK 依內建對照表（`src/libs/subjects.js`）轉成國英數自社；多個代碼可傳陣列或逗號分隔字串，取第一個對應得到的。對應不到的代碼（生活、健體、藝術…）視同不帶科目。`subjectOf(subject)` 回報實際套用的科目，對應不到時回傳 `null`。

依設定表開啟時，英文 formatter 會忽略答案最外層一組成對引號，字內撇號仍保留；外層括號 formatter 只略過包住整串答案的一對括號，座標 tuple 保留。各科可依設定表把頂層以分隔號分開的答案視為順序不拘、展開 `±`、交換完整相鄰括號因式順序（見「多個答案與分隔號」）。這些答案結構規則在 `format()` 的最後一步執行：不分順序或有 `±` 時，多個答案標準化後排序，以「、」接成一串（例：`5，-3` → `-3、5`、`±3` → `-3、3`、`(x-2)(x+1)` → `(x+1)(x-2)`）。`equals()` 先比對兩邊 `format()` 的結果，不同時再依分隔號規則比對。

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

### 多個答案與分隔號（kb-1005031）

答案依括號外的分隔號拆成多段，各段分別整理後比對，由三條各自獨立的開關決定（各科在設定表勾選，預設都關閉）：

| 開關（規則ID） | 只管什麼 | 例 |
| --- | --- | --- |
| 多個答案順序可互換（`answerOrder`） | 順序 | `丙、甲、己` 等於 `甲、丙、己` |
| 分隔號互通（`separatorInterchange`） | `、` `,` `，` 視為同一種分隔號 | `甲,丙,己`、`6,9` 等於 `甲、丙、己`、`6、9` |
| 寫不寫分隔號都算對（`separatorOptional`） | 一邊有分隔號、另一邊沒有時，接起來相同就相等 | `甲丙己`、`甲 丙 己`（空白已被空白規則去掉）等於 `甲、丙、己` |

- 沒勾分隔號互通時只有 `、` 拆答案，`,` `，` 是普通字元
- 括號裡的逗號（座標、區間 `(1,23)`、`[2,5)`）與千分位（`12,345`，交給「去逗號判斷」）不是分隔號
- 寫不寫分隔號：標準答案有分隔號、勾了順序互換、每段都是單一個字的代號（甲乙丙、ABC、①②）時，學生沒寫分隔號就一個字拆一段、不分順序（`己丙甲` 等於 `甲、丙、己`）；其他情況只照原順序接（`九州四國` 等於 `九州、四國`，`四國九州` 不等於）。標準答案沒有分隔號時，學生加分隔號也只照原順序（`甲丙己` 等於 `甲、丙、己`，不等於 `丙、甲、己`）
- `±`（`mathPlusMinus`）不看順序開關：展開後一律不分順序；比對對象含 `±` 時 `,` `，` 「或」也當分隔號（`±3` 等於 `3，-3`、`-3,3`、`3或-3`），其他時候「或」是普通字（「或許」不拆）
- 標準答案在完整答案對答表上的其他寫法也套同一套規則（表上 `三民主義` ← `民族、民權、民生`，學生寫 `民族,民權,民生`、`民族民權民生` 也算）
- 寫不寫分隔號這種相等無法化成同一個 `format()` 字串，只有 `equals()` 會套用；兩個參數不對稱，第一個要放標準答案
- 部分答案對答表「（刪除）← 、」改由「寫不寫分隔號都算對」負責；表上還有這一列時轉檔會提醒可以刪除（留著會讓沒勾的科目也刪掉頓號）

### formatter 開關

formatter 的執行順序固定在程式（順序有前後依賴，例如 LaTeX 要先轉純文字才能轉小寫、同義詞比對前要先整理空白），表上只決定每個 formatter 開或關：

- 開關依序合併程式預設、設定表「預設」欄、科目欄位；科目值覆蓋「預設」，「預設」覆蓋程式預設。空白值沿用較低優先層
- 可開關的 formatter：`fullwidthFormatter`、`latexFormatter`、`caseFormatter`（預設關閉，開啟後英文字母 A-Z 不分大小寫，希臘字母不轉）、`removeSpaceFormatter`、`removeNumberingFormatter`（預設關閉，開啟後刪除開頭、後面接英文字的題號：`①apple` 等於 `apple`；`②`、`①ˇ` 這類題號本身是答案的不刪）、`yearFormatter`、`interpunctFormatter`、`arrowFormatter`、`removeTailPeriodFormatter`、`numberFormatter`（預設關閉，開啟後刪除千分位逗號：`12,345` 等於 `12345`，只刪後面恰好接 3 位數字的逗號，`(4,8)` 不受影響）、`phoneticFormatter`、`outerQuoteOptional`（僅英文答案，預設關閉）、`outerBracketOptional`（預設關閉，只略過完整答案外的一對括號，座標 tuple 保留）、`answerOrder`、`separatorInterchange`、`separatorOptional`、`mathPlusMinus`、`mathFactorOrder`（答案結構，各科通用、預設關閉，見上方「多個答案與分隔號」）；除了標明預設關閉的，其餘預設開啟
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
- 把規則關掉後結果不變的範例沒有展示到這條規則，只寫進 log 的提醒（`Match table warning:`），不擋上傳；結果不變是因為完整／部分答案對答表已經把兩種寫法換成一樣時（例：部分答案對答 `,` ← `，` 讓全形逗號開關沒有作用），提醒會指出是哪張表的哪個寫法

#### 規則生效檢查

job 上傳前也會用同一份 SDK 檢查完整／部分答案對答表的每一列是否真的生效：在勾選的每個科目（與不帶科目）下，每個輸入答案應與標準答案判定相等，部分對答另檢查放進較長答案時也相等。不相等的列（例：部分對答把 `無煙囪產業` 改寫成 `觀光業` 後撞上完整對答的標準答案而被還原）寫進 log 的提醒，不擋上傳；SDK 載入失敗時 job 失敗（見下方「使用端契約案例」）。提醒只寫進 job 的 log（每則以 `Match table warning:` 開頭，severity 為 WARNING），回應的 `warnings` 固定是空陣列（Apps Script 成功時只顯示「轉檔完成」，kb-1005467）。每則提醒下面附上學生寫法與標準答案各自的處理過程：一個步驟一行，寫出是哪條規則或哪張對答表、把什麼換成什麼，最後一行是實際拿來比對的值。「多個答案順序可互換」這類答案結構規則會回頭拿原答案拆成多個答案，提醒會寫明前面步驟的結果沒有用上，並照原答案的順序列出拆出來的答案。

#### 使用端契約案例

使用端拿固定寫法查對答表的對應列在 `scripts/libs/contractCases.js`。目前只有 ms-check-answer 的是非題與選擇題（單選、多選、題組子題）這樣用，判法是不帶科目的 `format()` 相等（不帶科目會套用所有列，只勾某些科的列也算）；作答頁這幾種題型直接比字串、不用對答表，填充、選填題依題目內容判定，不列為契約（kb-1005720）：

- 是非題：作答系統把 X 送成 `false`、O 送成 `true`，要等於標準答案 `╳`、`×`、`X`／`○`、`◯`、`O`，且不等於相反的答案（kb-1005668）
- 選擇題的選項編號：`1`～`10` 經過 `format()` 要原樣不變；多選題拿 `format()` 後的作答直接比對選項序號，數字被改寫會整題判錯

job 上傳前用 S3 上的 SDK 檢查，有不符就失敗、不上傳，錯誤訊息寫出是哪個案例、該檢查什麼，並附上處理過程。這項檢查一定要跑，SDK 載入失敗時 job 也會失敗。新的使用端依賴對答表某個對應時，在這個檔案加案例。

#### 變動回報

job 上傳前抓線上的 `matchTable.v2.json` 和這次的表比對，把變動寫進 log（每則以 `Match table change:` 開頭，severity 為 NOTICE），不擋上傳（kb-1005721）。變動不放進回應的 `warnings`、不跳給編輯（kb-1005467、kb-1005461），要看這次改了什麼請查 log（見下方「job log」）：

- 對答表：多了、少了哪些列，同一個標準答案恰好一列換成另一列時寫成修改（輸入答案或科目從什麼改成什麼）。停用的列不會輸出，和刪除分不出來，一律寫成「少了（停用或刪除）」；只調順序不算變動
- 設定表：哪條規則的哪一欄從什麼改成什麼，用表上的規則名稱與勾選意思
- 沒有變動時記「和線上的對答表相比沒有變動」；抓不到線上的表時說明無法比對

#### job log

測試、正式專案的 log sink 排除 INFO 以下的紀錄，純文字的 console 輸出不會留下。job 的 log 一律用 `scripts/libs/logger.js` 輸出成帶 `severity` 的 JSON：提醒 WARNING、變動與上傳結果 NOTICE、失敗 ERROR（附 stack），INFO 的紀錄照樣不保留（kb-1005827）。只有 `severity` 與 `message` 的紀錄，Cloud Run 會把 message 放進 `textPayload`；帶其他欄位的才是 `jsonPayload`，查詢時兩邊都要查。每次轉檔結束記一筆 `Match table job finished`，帶這次的 `updateTime` 與提醒、變動筆數（變動只計真正改到的地方：沒有變動為 0，抓不到線上的表、沒比對為 `null`）。

```sh
gcloud logging read 'resource.labels.service_name=answer-formatter-script AND (textPayload:"Match table" OR jsonPayload.message:"Match table")' --project=tutor-test-238709 --freshness=1d
```

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

推 tag 觸發建置並上傳（SDK 走 GitHub Actions `.github/workflows/`，後端走 Cloud Build）：

| tag | 部署目標 |
| --- | --- |
| `X.Y.Z-SNAPSHOT` | SDK → 測試 S3 `tw-itembank-sandbox/v1/api/answerFormatter/{X.Y.Z,latest}/answerFormatter.js` |
| `X.Y.Z` | SDK → 正式 S3 `tw-itembank/v1/api/answerFormatter/{X.Y.Z,latest}/answerFormatter.js` |
| `scripts/X.Y.Z-SNAPSHOT` | 後端（`scripts/`）→ 測試 Cloud Run `answer-formatter-script`（Cloud Build trigger `answer-formatter-script-test`，設定檔 `scripts/cloudbuild.test.yaml`） |
| `scripts/X.Y.Z` | 後端（`scripts/`）→ 正式 Cloud Run `answer-formatter-script`（Cloud Build trigger `answer-formatter-script`，設定檔 `scripts/cloudbuild.prod.yaml`） |

```sh
git tag <版本>-SNAPSHOT && git push origin <版本>-SNAPSHOT   # 版本接續 git tag 最新一個
```

手動部署 SDK（需本機 AWS 權限；版本目錄固定為 `0.0.0`，另覆蓋 `latest`）：

```sh
npm run deploy-test   # 測試
npm run deploy-prod   # 正式
```

發布 npm 套件：`npm publish`（`prepare` 會先跑 `build-prod`）。

後端的 AWS 金鑰存在各專案（測試 `tutor-test-238709`、正式 `tutor-204108`）的 Secret Manager（`answer-formatter-aws-access-key`、`answer-formatter-aws-secret-key`），部署時掛成 Cloud Run 環境變數，不打包進 image。

手動部署後端（trigger 無法使用時；需本機 gcloud 權限）：

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

內建預設表 `src/data/matchTable.json` 是正式機 `matchTable.v2.json` 的快照（含設定表開關），只在 SDK 還沒抓到遠端表時使用。Sheet 改動較多時重抓一份放進來，抓不到遠端表時判定才會跟正式機一致：

```sh
curl -s --compressed https://tw-itembank.s3.ap-east-2.amazonaws.com/v1/api/answerFormatter/matchTable.v2.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.stringify(JSON.parse(s),null,2)+"\n"))' > src/data/matchTable.json
```

partialMatch 的套用與表上列順序無關（sc-134172）：

- 由左而右掃描答案，每個位置取最長的輸入答案替換（同一列的多個輸入答案在同一個答案裡都會替換）
- 掃完一輪若有改寫就再掃一輪，直到不再變動，前一條的結果可接著被下一條改寫（例：`攝氏` → `°C` → `度C`）
- 標準答案含有自己輸入答案的擴寫規則（例：`中國國民黨` ← `國民黨`）不會重複擴寫
- 規則彼此改來改去而不會收斂時（例：`劃` ← `畫` 與 `計畫` ← `計劃`），job 失敗、不上傳，錯誤訊息列出循環的寫法

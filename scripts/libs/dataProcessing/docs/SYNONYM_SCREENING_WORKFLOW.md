# Synonym 篩選流程

這份文件整理目前實際使用中的 synonym 篩選流程，供新對話快速接手。

流程分成兩段：

1. 從 `UserQuestions` 匯出並做前處理
2. 對前處理後剩下的 `review` 做人工／半人工裁決

相關判準請搭配以下兩份文件一起看：

- [PREPROCESS_SYNONYM_RULES.md](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/docs/PREPROCESS_SYNONYM_RULES.md)
- [REVIEW_PAIR_DECISION_RULES.md](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/docs/REVIEW_PAIR_DECISION_RULES.md)

## 1. 匯出 UserQuestions

目的：

- 從 `answer-formatter.UserQuestions` 展平出 `(correctAnswer, userAnswer)` pair
- 只保留後續 synonym 判斷需要的欄位

主要腳本：

- [exportSynonymTasks.js](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/exportSynonymTasks.js)

輸出格式：

- `ndjson`
- 每行一筆 task

常見欄位：

- `sourceId`
- `itemId`
- `questionIndex`
- `answerIndex`
- `correctAnswer`
- `userAnswer`

常見輸出位置：

- `scripts/tmp/synonym-tasks-full.ndjson`

## 2. 前處理

目的：

- 先用高信心規則把資料分成：
  - `accepted`
  - `rejected`
  - `review`

主要腳本：

- [preprocessSynonymTasks.js](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/preprocessSynonymTasks.js)

規則來源：

- [PREPROCESS_SYNONYM_RULES.md](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/docs/PREPROCESS_SYNONYM_RULES.md)

常見輸出目錄：

- `scripts/tmp/synonym-preprocessed-full-vN`

目錄內通常有：

- `accepted.ndjson`
- `rejected.ndjson`
- `review.ndjson`
- `summary.json`

## 3. 先扣掉 answerFormatter 已支援的 accepted

目的：

- `accepted` 裡有一部分其實已經被 runtime `answerFormatter.equals()` 支援
- 這些不需要再額外靠人工 synonym table 維護

主要腳本：

- [filterAcceptedByAnswerFormatter.js](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/filterAcceptedByAnswerFormatter.js)

注意：

- 執行前要先 `await answerFormatter.updateMatchTable()`
- 以最新 `default matchTable` 或遠端更新後的表為準

常見輸出：

- `accepted.supported-by-answer-formatter.ndjson`
- `accepted.remaining.ndjson`
- `summary.json`

## 4. review 的處理方式

目前實務上採用的是：

- 先從 `review.ndjson` 聚合出 `top1000` unique pairs
- 對這 `1000` 組 pair 補上下文
- 建立 `progress.json`
- 逐組判成 `accepted` 或 `rejected`
- 再 apply 回整份 `review`

這不是最終唯一方法，但目前是最穩定、最可追蹤的做法。

## 5. 產生 review top1000

目的：

- 從 `review.ndjson` 聚合 unique `(correctAnswer, userAnswer)` pair
- 依出現次數排序
- 取前 `1000` 組作為當輪裁決對象

主要腳本：

- [aggregateReviewPairs.js](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/aggregateReviewPairs.js)

常見輸出：

- `review-unique-pairs-top1000-roundN.json`

內容通常包含：

- `id`
- `correctAnswer`
- `userAnswer`
- `count`
- `examples`

## 6. 補題目脈絡

目的：

- 從 `UserQuestions` 回查題目上下文
- 讓後續裁決時可用 `itemStem`、`itemAnswer`、`itemSolution`

主要腳本：

- [enrichReviewPairDecisions.js](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/enrichReviewPairDecisions.js)

常見輸出：

- `review-pair-decisions-top1000-roundN-context.json`

這份檔案只放「判斷所需的上下文」，不放 decision。

## 7. 建立 progress 工作檔

目的：

- 從 `context.json` 初始化一份可逐筆填判定的工作檔

主要腳本：

- [prepareReviewPairDecisions.js](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/prepareReviewPairDecisions.js)

常見輸出：

- `review-pair-decisions-top1000-roundN-progress.json`

`progress.json` 應只保留：

- `input`
- `decidedThroughId`
- `decisions`

每筆 decision 常見欄位：

- `id`
- `correctAnswer`
- `userAnswer`
- `count`
- `decision`
- `confidence`
- `reason`

## 8. review pair 裁決原則

實際裁決時，一律以：

- [REVIEW_PAIR_DECISION_RULES.md](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/docs/REVIEW_PAIR_DECISION_RULES.md)

為準。

核心原則：

- 先看 `itemStem` 與 `itemAnswer`
- `itemSolution` 只輔助理解，不直接加嚴
- 題目正文中的顯性提示要算進去
- 命中某條接受規則，不代表直接通過
- 所有適用規則都要通過，沒有 veto 才能 `accepted`

目前已知容易誤判的高風險類型：

- 空格外已有後綴字
- 單位、角度符號、有效位數缺漏
- 題目要求填代號
- 題組標記與答案本體混在一起
- 英文重組題被誤當翻譯題
- 多解題只答其一

## 9. 套回整份 review

目的：

- 把某一輪 `progress.json` 已判定的 pair 套回整份 `review.ndjson`
- 將命中的資料搬到新的 `accepted` / `rejected`

主要腳本：

- [applyReviewPairDecisions.js](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/applyReviewPairDecisions.js)

輸出通常會建立新目錄，例如：

- `scripts/tmp/synonym-preprocessed-full-applied-top1000-roundN`

目錄內常見檔案：

- `accepted.ndjson`
- `rejected.ndjson`
- `review.ndjson`
- `accepted.from-review.ndjson`
- `rejected.from-review.ndjson`
- `summary.json`

## 10. 下一輪如何開始

apply 完後，以新目錄內的：

- `review.ndjson`

作為下一輪基底，重新執行：

1. `aggregateReviewPairs.js`
2. `enrichReviewPairDecisions.js`
3. `prepareReviewPairDecisions.js`
4. 人工／半人工更新 `progress.json`
5. `applyReviewPairDecisions.js`

## 11. 何時不再適合用 top1000

當出現以下狀況時，`top1000` 的效益會明顯下降：

- 排名前段 pair 的 `count` 已經掉到十幾筆左右
- `top1000` 合計覆蓋量只剩一萬筆上下
- 大部分 case 都變成語意型判斷，不再是格式型或高頻結構型

這時可改成：

- 直接逐批 review
- 或只複查高風險 `accepted`
- 或只複查規則衝突型 case

## 12. 建議的新對話接手順序

若要在新對話中接手，建議順序：

1. 先看目前最新的 `summary.json`
2. 確認最新一輪的：
   - `review.ndjson`
   - `review-pair-decisions-*.progress.json`
3. 讀：
   - [PREPROCESS_SYNONYM_RULES.md](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/docs/PREPROCESS_SYNONYM_RULES.md)
   - [REVIEW_PAIR_DECISION_RULES.md](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/docs/REVIEW_PAIR_DECISION_RULES.md)
4. 再決定是：
   - 開下一輪 `top1000`
   - 複查既有 `progress.json`
   - 或直接 apply

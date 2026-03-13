# 同義詞預處理規則

這份文件說明
[`libs/dataProcessing/preprocessSynonymTasks.js`](/Users/ehanlin/workspace/answer-formatter/scripts/libs/dataProcessing/preprocessSynonymTasks.js)
在進入人工或模型語意判斷前，會先套用哪些「可確定、可重複」的規則。

## 目的

預處理階段刻意採取保守策略：

- 把只是表面形式不同、實際等價的答案直接收進 `accepted`
- 把明顯雜訊或明顯錯答直接放進 `rejected`
- 把仍然需要語意判斷的案例保留在 `review`

## 輸出分類

- `accepted`：高信心可直接接受的答案配對
- `rejected`：明顯雜訊或明顯不相等的答案配對
- `review`：需要後續語意判斷的答案配對

## 規則執行順序

規則依照下列順序執行，原因是前面的規則通常更便宜、更穩定：

1. `placeholder-or-noise`
2. `formatting-equivalent`
3. `numeric-equivalent`
4. `ratio-equivalent`
5. `coordinate-format-equivalent`
6. `coordinate-bracket-mismatch`
7. `option-label-equivalent`
8. `option-label-mismatch`
9. `english-typo-mismatch`
10. `direction-label-mismatch`
11. `plus-minus-mismatch`
12. `coordinate-mismatch`
13. `coordinate-vs-scalar-mismatch`
14. `bopomofo-mismatch`
15. `bopomofo-garbage`
16. `symbol-or-emoji-garbage`
17. `repeated-char-garbage`
18. `english-function-word-mismatch`
19. `numeric-notation-mismatch`
20. `algebraic-vs-scalar-mismatch`
21. `obvious-mismatch`
22. 其餘都落到 `needs-semantic-review`

## 共用正規化

在部分規則執行前，程式會先做一些共用正規化：

- 移除 HTML 標籤
- 去除前後空白
- 合併重複空白
- 將全形 ASCII 轉成半形
- 將常見 Unicode 數字字形轉成一般阿拉伯數字
  - 例如：`⑨ -> 9`、`⑩ -> 10`
- 在純文字比較時移除常見標點
  - 例如：括號、逗號、句號、全形標點
- 但數字中的小數點與數字分隔符不會被當成純格式忽略
  - 例如：`6.18` 不會被正規化成 `618`

## 各規則說明

### `placeholder-or-noise` -> `rejected`

明顯是垃圾值或占位值時，直接排除。

例子：

- 空值
- URL 被貼成答案
- `?`、`＿`、`×` 這類占位字元

### `formatting-equivalent` -> `accepted`

如果雙方在正規化後完全相同，就直接接受。
但這條規則不會套用在代數式或算式類答案上，因為括號與運算符號可能改變語意。

例子：

- `He is playing the guitar.` / `He is playing the guitar`
- `（E）` / `E`
- `(Ｂ)` / `Ｂ`
- `95` / `⑨⑤`
- `<p>He is playing the guitar.</p>` / `He is playing the guitar`

### `numeric-equivalent` -> `accepted`

如果雙方都能解析成數值，且數值與單位一致，就直接接受。

目前支援：

- 整數
- 小數
- 簡單分數
- 可選單位：`x`、`cm`
- 只有在數值與單位都一致時才接受

例子：

- `1.05x` / `21/20x`
- `0.05x` / `1/20x`

### `ratio-equivalent` -> `accepted`

如果雙方都能解析為比值，且比值一致，就直接接受。

例子：

- `4：3` / `8:6`

### `coordinate-format-equivalent` -> `accepted`

若雙方都可解析為座標，且座標值完全相同，只是括號、逗號、空白或全半形不同，直接接受。

例子：

- `（2 , 5）` / `(2,5)`
- `（5, －2）` / `(5,-2)`

補充：

- 只有在雙方都仍然是合法座標格式時才接受
- 若缺少座標括號，不算純格式差異

### `coordinate-bracket-mismatch` -> `rejected`

若正確答案是合法座標，但使用者答案只寫成 `x,y` 而沒有括號，直接排除。

例子：

- `（－5 , －1）` / `－5, －1`
- `(2,5)` / `2,5`

### `option-label-equivalent` -> `accepted`

若雙方都是相同的選項代號，只差括號、全半形或大小寫，直接接受。

例子：

- `（E）` / `E`
- `(Ｂ)` / `Ｂ`
- `(Ｃ)` / `c`

### `option-label-mismatch` -> `rejected`

若雙方都是選項代號，但代表的選項不同，直接排除。

支援形式：

- 英文字母選項：`A`、`B`、`C`
- 含括號選項：`(A)`、`（Ｂ）`
- 中文序列選項：`甲`、`乙`、`丙`、`丁`

例子：

- `(Ｂ)` / `A`
- `(Ａ)` / `B`
- `(乙)` / `甲`

### `english-typo-mismatch` -> `rejected`

若雙方是英文單字或英文片語，且只差一個很小的拼字錯誤，視為「明顯不是同義詞」，直接排除。

這條規則反映的是這個任務的分類定義：

- 我們要找的是同義詞，不是拼字容錯
- 因此拼字錯誤不進 `accepted`
- 若可高信心判斷只是錯拼，直接進 `rejected`

目前條件：

- 雙方都屬於 ASCII 英文樣式
- 正規化後至少 5 個字母
- 編輯距離必須剛好是 1

例子：

- `Chinese` / `chineese`
- `chatted` / `chated`

### `direction-label-mismatch` -> `rejected`

若雙方都是同一個角度搭配方位標記，但方位不同，直接排除。

例子：

- `30°W` / `30°N`
- `60°N` / `60°W`

### `plus-minus-mismatch` -> `rejected`

若正確答案是 `±x`，但使用者只填了單一數值 `x` 或 `-x`，直接排除。

這不是同義，而是少了一半的答案集合。

例子：

- `±6` / `6`
- `± 2.5` / `2.5`

### `coordinate-mismatch` -> `rejected`

若雙方都可解析為座標，但座標值不同，直接排除。

例子：

- `（1 , 3）` / `(-9,3)`
- `（2 , -10）` / `(2,10)`

### `coordinate-vs-scalar-mismatch` -> `rejected`

若一方是合法座標，另一方只是單一數值，直接排除。

例子：

- `（0 , 2）` / `0`
- `（162.5 , 8）` / `162.5`

### `bopomofo-mismatch` -> `rejected`

若雙方都是完整注音，但聲母、韻母或聲調不同，直接排除。

例子：

- `ㄋㄧㄢˊ` / `ㄋㄧㄢˇ`
- `ㄔㄨㄞˇ` / `ㄘㄨㄞˇ`

### `bopomofo-garbage` -> `rejected`

若使用者答案含注音，但本身不是完整、可辨識的標準注音形式，視為雜訊直接排除。

例子：

- `ㄞ3`
- `ㄔㄧ`
- `2152151651ㄨ`
- `ㄨㄚㄡㄡ`

### `symbol-or-emoji-garbage` -> `rejected`

若使用者答案是單一符號、emoji 或明顯非文字圖像字元，直接排除。

例子：

- `🎫`
- `🅰`
- `🐻`

### `repeated-char-garbage` -> `rejected`

若使用者答案只是同一字元重複多次，視為明顯亂填，直接排除。

例子：

- `啊啊啊啊啊`
- `ㄨㄨㄨㄨㄨ`
- `ㄖㄖㄖㄖㄖ`

### `english-function-word-mismatch` -> `rejected`

若雙方都是常見英文功能詞，且內容不同，直接排除。

這類通常是文法或詞性選擇錯誤，不是同義詞問題。

例子：

- `has` / `have`
- `are` / `is`
- `them` / `it`
- `for` / `at`

### `numeric-notation-mismatch` -> `rejected`

若雙方都長得像數字答案，但格式無法解析成相同數值，直接排除。

這條規則主要用來擋下小數點、逗號或其他數字記號混用造成的明顯錯答。

例子：

- `0.6018` / `0,6018`
- `618` / `6.18`

### `algebraic-vs-scalar-mismatch` -> `rejected`

若一方是代數式，另一方只是單一數值，直接排除。

例子：

- `3x＋7` / `14`
- `y＝－x＋2` / `123`

### `obvious-mismatch` -> `rejected`

如果從結構上就能確定不可能等價，直接排除。

目前包含：

- 雙方都能解析成數字，但數值不同
- 雙方都能解析成比例，但比例不同
- 雙方都能解析成座標，但座標不同
- 雙方都是單一字元且不同

例子：

- `12` / `6`
- `（E）` / `（B）`
- `簷` / `延`

補充：

- 英文拼字錯誤不視為同義詞
- 例如 `Chinese / chineese`、`chatted / chated` 應直接進 `rejected`

## `review` 類別

凡是不符合上述可確定規則的，都會先留在 `review`。

常見情況：

- 是否同義取決於課程脈絡
- 簡稱、地理代稱或範圍縮寫
- 相關但不必然等價的專有名詞
- 類似 OCR、注音或音近字誤寫，若自動接受風險太高

例子：

- `公權` / `公權力`
- `馬祖列嶼` / `馬祖`
- `宜蘭` / `蘭陽`

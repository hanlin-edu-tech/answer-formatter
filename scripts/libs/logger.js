// 測試、正式專案的 log sink 排除 INFO 以下的紀錄，純文字輸出會被當成 DEFAULT 而丟掉；
// 要留下的紀錄用 JSON 帶 severity 輸出（Cloud Run 會解析 stdout 的 JSON，kb-1005827）
const __write = severity => (message, fields = {}) => console.log(JSON.stringify({ severity, message, ...fields }))

module.exports = {
  info: __write('INFO'),
  notice: __write('NOTICE'),
  warning: __write('WARNING'),
  error: __write('ERROR')
}

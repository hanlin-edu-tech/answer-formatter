const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1-Wz4GjbvE5h-jlOAW6FcznTzBsF6uM5AtuEPMQbquPc/gviz/tq?tqx=out:csv&gid=0';

/**
 * Fetches and parses test cases from a Google Sheet CSV URL.
 * @param {string} url The URL of the Google Sheet in CSV format.
 * @returns {Promise<Array<{input: string, expected: string}>>} A promise that resolves to an array of test cases.
 */
async function fetchTestCases(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP 錯誤！狀態： ${response.status}`);
  }
  const csvText = await response.text();
  return csvText
    .split('\n')
    .slice(1) // Skip header row
    .map(row => {
      const columns = row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
      return { input: columns[0], expected: columns[1] };
    })
    .filter(tc => tc.input); // Filter out empty or invalid rows
}

/**
 * Renders a single test result row in the table.
 * @param {HTMLElement} resultsBody The tbody element to append the row to.
 * @param {{input: string, expected: string}} testCase The test case to process and render.
 */
function renderTestResult(resultsBody, testCase) {
  const { input, expected } = testCase;
  const actual = window.answerFormatter.format(input);
  const isPass = String(actual) === expected;

  const row = resultsBody.insertRow();
  row.className = isPass ? '' : 'fail-row';
  row.innerHTML = `
    <td><code>${input}</code></td>
    <td><code>${expected === undefined ? '' : expected}</code></td>
    <td><code>${actual}</code></td>
    <td class="${isPass ? 'status-pass' : 'status-fail'}">
      ${isPass ? '通過' : '失敗'}
    </td>
  `;
}

/**
 * Renders an error message in the table.
 * @param {HTMLElement} resultsBody The tbody element to append the error row to.
 * @param {Error} error The error to display.
 */
function renderError(resultsBody, error) {
  console.error('載入或處理測試案例時發生錯誤：', error);
  const row = resultsBody.insertRow();
  row.innerHTML = `<td colspan="4" style="color: red; text-align: center;">載入測試案例時發生錯誤：${error.message}</td>`;
}

/**
 * Main function to run on window load.
 */
window.addEventListener('load', async () => {
  const resultsBody = document.getElementById('results-body');
  try {
    const testCases = await fetchTestCases(SHEET_URL);
    testCases.forEach(testCase => renderTestResult(resultsBody, testCase));
  } catch (error) {
    renderError(resultsBody, error);
  }
});

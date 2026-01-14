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
 * @returns {boolean} Whether the test case passed.
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
  return isPass;
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
 * Runs tests and renders them incrementally to allow browser repaints.
 * @param {Array} testCases Array of test cases.
 * @param {HTMLElement} resultsBody The tbody element to append rows to.
 * @param {HTMLElement} totalTestsEl The element to display the total number of tests.
 * @param {HTMLElement} failedTestsEl The element to display the number of failed tests.
 * @param {HTMLElement} successRateEl The element to display the success rate.
 */
async function runTestsIncrementally(testCases, resultsBody, totalTestsEl, failedTestsEl, successRateEl) {
  let passedCount = 0;
  const totalCount = testCases.length;
  totalTestsEl.textContent = totalCount;
  failedTestsEl.textContent = 0;
  successRateEl.textContent = '0.00%';

  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    const isPass = renderTestResult(resultsBody, testCase);
    if (isPass) {
      passedCount++;
    }

    const processedCount = i + 1;
    const failedCount = processedCount - passedCount;
    failedTestsEl.textContent = failedCount;
    const successRate = processedCount > 0 ? (passedCount / processedCount * 100) : 0;
    successRateEl.textContent = `${successRate.toFixed(2)}%`;

    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

/**
 * Main function to run on window load.
 */
window.addEventListener('load', async () => {
  const resultsBody = document.querySelector('#results-body');
  const version = document.querySelector('#version');
  const totalTestsEl = document.querySelector('#total-tests');
  const failedTestsEl = document.querySelector('#failed-tests');
  const successRateEl = document.querySelector('#success-rate');

  try {
    // Display version
    if (window.answerFormatter) {
      version.textContent = window.answerFormatter?.version || ''; 
    }

    const testCases = await fetchTestCases(SHEET_URL);
    await runTestsIncrementally(testCases, resultsBody, totalTestsEl, failedTestsEl, successRateEl);
  } catch (error) {
    renderError(resultsBody, error);
  }
});
const fetcher = {
  async get(url = '', init = {}) {
    let maxTry = 3
    do {
      maxTry--
      console.log(`Fetching: ${url} (remaining tries: ${maxTry})`)
      try {
        const res = await fetch(url, {
          method: 'GET',
          ...init
        })
        if (res.status === 200) {
          const contentType = res.headers.get('Content-Type')
          if (contentType.includes('application/json')) {
            const result = await res.json()
            return result
          }
        }
      } catch (err) {
        console.error(err)
      }
    } while (maxTry)
    return null
  },
  async post(url = '', body = {}, init = {}) {
    let maxTry = 3
    do {
      maxTry--
      console.log(`Posting to: ${url} (remaining tries: ${maxTry})`)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          ...init
        })

        if (res.ok) {
          return await res.json()
        }
        
        // 4xx 為用戶端錯誤，重試不會成功，反而會放大後端與 LLM 的額度消耗
        if (res.status < 500) {
          const errorBody = await res.text()
          const clientError = new Error(`API request failed with client error ${res.status}: ${errorBody}`)
          clientError.status = res.status
          clientError.nonRetryable = true
          throw clientError
        }
        // 對於 5xx 伺服器錯誤，允許重試
        console.warn(`API request failed with server error ${res.status}. Retrying...`)
      } catch (err) {
        console.error('An error occurred during the POST request:', err)
        // 不可重試的錯誤直接往外拋，避免被迴圈重複發送
        if (err?.nonRetryable || maxTry <= 0) {
          throw err
        }
      }
    } while (maxTry > 0)
    
    // 如果所有重試都失敗，最終拋出一個錯誤
    throw new Error(`Failed to post to ${url} after several retries.`)
  }
}

module.exports = fetcher

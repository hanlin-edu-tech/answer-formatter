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
        
        // 如果請求不成功，但不是暫時性伺服器錯誤，可能不需要重試
        if (res.status < 500) {
          const errorBody = await res.text()
          throw new Error(`API request failed with client error ${res.status}: ${errorBody}`)
        }
        // 對於 5xx 伺服器錯誤，允許重試
        console.warn(`API request failed with server error ${res.status}. Retrying...`)
      } catch (err) {
        console.error('An error occurred during the POST request:', err)
        if (maxTry <= 0) {
          // 如果是最後一次嘗試，則重新拋出錯誤
          throw err
        }
      }
    } while (maxTry > 0)
    
    // 如果所有重試都失敗，最終拋出一個錯誤
    throw new Error(`Failed to post to ${url} after several retries.`)
  }
}

module.exports = fetcher

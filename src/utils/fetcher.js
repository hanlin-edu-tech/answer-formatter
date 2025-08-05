const fetcher = {
  async get(url = '', init = {}) {
    let maxTry = 5
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
  }
}

module.exports = fetcher

const fetcher = {
  async get(url = '', init = {}) {
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
    return null
  }
}

module.exports = fetcher

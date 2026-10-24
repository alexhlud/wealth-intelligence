#!/usr/bin/env node

// Manual verification only. It reads FINNHUB_API_KEY but never prints it.
// NVDA completed a 10-for-1 split after the June 7, 2024 close. The SEC's
// June 7 disclosure reports the pre-split closing price as $1,208.88:
// https://www.sec.gov/Archives/edgar/data/1045520/000110465924070719/tm2416207d10_424b2.htm

const apiKey = process.env.FINNHUB_API_KEY
if (!apiKey) {
  console.error('FINNHUB_API_KEY is required. The key was not sent or printed.')
  process.exitCode = 1
} else {
  const symbol = 'NVDA'
  const sessionDate = '2024-06-07'
  const expectedRawClose = 1208.88
  const from = Math.floor(Date.parse(`${sessionDate}T00:00:00Z`) / 1000)
  const to = Math.floor(Date.parse('2024-06-08T00:00:00Z') / 1000)
  const endpoint = new URL('https://finnhub.io/api/v1/stock/candle')
  endpoint.search = new URLSearchParams({ symbol, resolution: 'D', from: String(from), to: String(to), token: apiKey }).toString()

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) {
      console.error(`Finnhub returned HTTP ${response.status}. Result is inconclusive; the key was not printed.`)
      process.exitCode = 1
    } else {
      const body = await response.json()
      const timestamps = Array.isArray(body?.t) ? body.t : []
      const closes = Array.isArray(body?.c) ? body.c : []
      const index = timestamps.indexOf(from)
      const close = index >= 0 ? closes[index] : undefined
      if (body?.s !== 'ok' || typeof close !== 'number' || !Number.isFinite(close)) {
        console.error('Finnhub returned no valid daily candle for NVDA on 2024-06-07. Result is inconclusive.')
        process.exitCode = 1
      } else {
        const rawDifference = Math.abs(close - expectedRawClose)
        const adjustedDifference = Math.abs(close - expectedRawClose / 10)
        console.log(`Symbol/date: ${symbol} ${sessionDate}`)
        console.log(`Known pre-split close: $${expectedRawClose.toFixed(2)}`)
        console.log(`Finnhub default candle close: $${close.toFixed(6)}`)
        if (rawDifference <= 0.02) {
          console.log('RESULT: RAW — the default candle close matches the known pre-split price within $0.02.')
          process.exitCode = 0
        } else if (adjustedDifference <= 0.02) {
          console.log('RESULT: ADJUSTED — the default candle close matches the 10-for-1 split-adjusted price. Do not store it as raw.')
          process.exitCode = 2
        } else {
          console.log('RESULT: INCONCLUSIVE — the value matches neither expected raw nor expected split-adjusted close. Do not store it as raw.')
          process.exitCode = 1
        }
      }
    }
  } catch {
    console.error('Finnhub request failed. Result is inconclusive; the key was not printed.')
    process.exitCode = 1
  }
}

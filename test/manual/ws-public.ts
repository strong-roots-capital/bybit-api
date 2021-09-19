import { constVoid } from 'fp-ts/function'

import { bybitPublicWebsocket } from '../../src'
import { BybitTimeframeFromString } from '../../src/codecs/BybitTimeframe'
import { unsafeParse } from '../../src/codecs/unsafe-parse'

const ws = bybitPublicWebsocket({ testnet: true })

async function main() {
  const stream = await ws.subscribe({
    channel: 'klineV2',
    interval: unsafeParse(BybitTimeframeFromString, '1'),
    symbol: 'BTCUSD',
  })

  stream.subscribe((_) => console.log(_), console.error, constVoid)
}

main()

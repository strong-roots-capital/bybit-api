import * as t from 'io-ts'
import * as T from 'fp-ts/Task'
import * as IO from 'fp-ts/IO'
import * as TE from 'fp-ts/TaskEither'
import * as Console from 'fp-ts/Console'
import { pipe, flow, constVoid } from 'fp-ts/function'

import { bybitRestClient } from '../../src/index'
import { unsafeParse } from './unsafe-parse'
import { BybitTimeframeFromString } from '../../src/codecs/BybitTimeframe'

const b = bybitRestClient({
  testnet: true,
})

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

const main: T.Task<void> = pipe(
  b.kline({
    symbol: 'BTCUSD',
    from: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    interval: unsafeParse(BybitTimeframeFromString, '1W'),
    limit: unsafeParse(t.Int, 2),
  }),
  TE.fold(
    T.fromIOK(
      flow(
        Console.error,
        IO.chain(() => exit(1)),
      ),
    ),
    T.fromIOK(flow(Console.log, IO.map(constVoid))),
  ),
)

main()

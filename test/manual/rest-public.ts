import * as Console from 'fp-ts/Console'
import * as IO from 'fp-ts/IO'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow, constVoid } from 'fp-ts/function'
import * as t from 'io-ts'
import D from 'od'

import { BybitTimeframeFromString } from '../../src/codecs/BybitTimeframe'
import { unsafeParse } from '../../src/codecs/unsafe-parse'
import { bybitRestClient } from '../../src/index'

const b = bybitRestClient({
  testnet: true,
})

const exit = (code: 0 | 1): IO.IO<void> => () => process.exit(code)

const main: T.Task<void> = pipe(
  b.kline({
    symbol: 'BTCUSD',
    from: pipe(D.of('2021-09-18T22:44:00.000Z'), D.subtract('minute', 1)),
    // from: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    interval: unsafeParse(BybitTimeframeFromString, '1'),
    limit: unsafeParse(t.Int, 1),
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

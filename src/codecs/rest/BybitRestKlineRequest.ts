import * as t from 'io-ts'
import { DateFromUnixTime } from 'io-ts-types'

import { BybitTimeframeFromString } from '../BybitTimeframe'
import { BybitTradepair } from '../BybitTradepair'

export const BybitRestKlineRequest = t.intersection([
  t.type({
    symbol: BybitTradepair,
    interval: BybitTimeframeFromString,
    from: DateFromUnixTime,
  }),
  t.partial({
    // Must be between 0 and 200
    limit: t.Int,
  }),
])
export type BybitRestKlineRequest = t.TypeOf<typeof BybitRestKlineRequest>

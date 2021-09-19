import * as t from 'io-ts'
import { DateFromUnixTime, NumberFromString } from 'io-ts-types'

import { BybitTimeframeFromString } from '../BybitTimeframe'
import { BybitTradepair } from '../BybitTradepair'

export const KlineResponse = t.type({
  symbol: BybitTradepair,
  interval: BybitTimeframeFromString,
  open_time: DateFromUnixTime,
  open: NumberFromString,
  high: NumberFromString,
  low: NumberFromString,
  close: NumberFromString,
  volume: NumberFromString,
  turnover: NumberFromString,
})
export type KlineResponse = t.TypeOf<typeof KlineResponse>
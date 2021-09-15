import * as RA from 'fp-ts/ReadonlyArray'
import { pipe } from 'fp-ts/function'
import * as t from 'io-ts'
import * as S from 'parser-ts/string'

/**
 * Generated with
 *
 * ```bash
 * curl https://api.bybit.com/v2/public/symbols \
 *   | jq --raw-output '.result \
 *   | map(.name | select(endswith("21") | not))[]'
 * ```
 */
const bybitTradepairs = [
  'BTCUSD',
  'ETHUSD',
  'EOSUSD',
  'XRPUSD',
  'BTCUSDT',
  'ETHUSDT',
  'AXSUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'EOSUSDT',
  'THETAUSDT',
  'TRXUSDT',
  'COMPUSDT',
  'XLMUSDT',
  'ADAUSDT',
  'DOTUSDT',
  'BNBUSDT',
  'LTCUSDT',
  'ETCUSDT',
  'MATICUSDT',
  'LINKUSDT',
  'AAVEUSDT',
  'BCHUSDT',
  'SOLUSDT',
  'UNIUSDT',
  'FILUSDT',
  'SUSHIUSDT',
  'XTZUSDT',
  'XEMUSDT',
] as const

/*********************************************************************
 * Codecs
 ********************************************************************/

export const BybitTradepair = pipe(
  bybitTradepairs,
  RA.reduce({} as Record<typeof bybitTradepairs[number], null>, (acc, a) =>
    Object.assign(acc, { [a]: null }),
  ),
  t.keyof,
)
export type BybitTradepair = t.TypeOf<typeof BybitTradepair>

/*********************************************************************
 * Parser combinators
 ********************************************************************/

export const Parser = S.oneOf(Object.assign(RA.Functor, RA.Foldable))(bybitTradepairs)

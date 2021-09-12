import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import * as t from 'io-ts'
import { DateFromNumber, DateFromUnixTime } from 'io-ts-types'

export const DateFromUnixTimeInNanoseconds = new t.Type<Date, number, unknown>(
  'DateFromUnixTimeInNanoseconds',
  (u): u is Date => u instanceof Date,
  (u, c) =>
    pipe(
      t.number.validate(u, c),
      E.chain((n) => DateFromNumber.validate(n / 1000, c)),
    ),
  (date) => date.getTime() * 1000,
)

export const BybitKline = t.type({
  start: DateFromUnixTime,
  end: DateFromUnixTime,
  open: t.number,
  close: t.number,
  high: t.number,
  low: t.number,
  volume: t.number,
  turnover: t.number,
  timestamp: DateFromUnixTimeInNanoseconds,
  confirm: t.boolean,
})
export type BybitKline = t.TypeOf<typeof BybitKline>

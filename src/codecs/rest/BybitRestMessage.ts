import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import * as t from 'io-ts'
import { NumberFromString } from 'io-ts-types'

type DateFromUnixTimeC = t.Type<Date, number>

const DateFromUnixTime: DateFromUnixTimeC = new t.Type<Date, number, unknown>(
  'DateFromUnixTime',
  (u): u is Date => u instanceof Date,
  (u, c) =>
    pipe(
      // This line is different from the io-ts-types definition:
      // bybit returns a value with 6 decimal places here
      t.number.validate(u, c),
      E.chain((n) => {
        const d = new Date(n * 1000)
        return isNaN(d.getTime()) ? t.failure(u, c) : t.success(d)
      }),
    ),
  (a) => Math.floor(a.getTime() / 1000),
)

export const BybitRestMessage = <C extends t.Mixed>(codec: C) =>
  t.type(
    {
      ret_code: t.Int,
      ret_msg: t.string,
      ext_code: t.string,
      ext_info: t.string,
      result: t.array(codec),
      time_now: NumberFromString.pipe(DateFromUnixTime),
    },
    'BybitRestMessage',
  )

export type BybitRestMessage<T> = {
  ret_code: t.Int
  ret_msg: string
  ext_code: string
  ext_info: string
  result: Array<T>
  time_now: Date
}

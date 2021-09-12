import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import * as t from 'io-ts'
import { withMessage } from 'io-ts-types'
import * as P from 'parser-ts/Parser'
import * as C from 'parser-ts/char'
import { run } from 'parser-ts/code-frame'
import * as S from 'parser-ts/string'

/*********************************************************************
 * Parser combinators
 ********************************************************************/

type BybitTimeframeAst = {
  quantifier: number
  unit: string
}

// Note: intentionally ignoring monthly timeframe
type BybitTimeframeUnit = 'minute' | 'hour' | 'day' | 'week'

const construct: Record<
  BybitTimeframeUnit,
  (quantifier: number) => BybitTimeframeAst
> = {
  minute: (quantifier) => ({
    quantifier,
    unit: 'minute',
  }),
  hour: (quantifier) => ({
    quantifier,
    unit: 'hour',
  }),
  day: (quantifier) => ({
    quantifier,
    unit: 'day',
  }),
  week: (quantifier) => ({
    quantifier,
    unit: 'week',
  }),
}

const minutesParser: P.Parser<string, BybitTimeframeAst> = pipe(
  S.float,
  P.map(construct.minute),
)

const hoursParser: P.Parser<string, BybitTimeframeAst> = pipe(
  S.float,
  P.chainFirst(() => C.char('H')),
  P.map(construct.hour),
)

const daysParser: P.Parser<string, BybitTimeframeAst> = pipe(
  S.float,
  P.chainFirst(() => C.char('D')),
  P.map(construct.day),
)

const weeksParser: P.Parser<string, BybitTimeframeAst> = pipe(
  S.float,
  P.chainFirst(() => C.char('W')),
  P.map(construct.week),
)

/**
 * @internal
 */
export const Parser = pipe(
  weeksParser,
  P.alt(() => daysParser),
  P.alt(() => hoursParser),
  P.alt(() => minutesParser),
)

/*********************************************************************
 * Codecs
 ********************************************************************/

const Int = withMessage(
  t.Int,
  (i) => `Expected value "${i}" to be a whole number`,
)

/**
 * Timeframe Quantifiers
 *
 * Only support a subset of the timeframes that Bybit itself supports,
 * to foster a rapid development time.
 */

const BybitTimeframeMinutesQuantifier = t.intersection([
  Int,
  t.union([t.literal(1), t.literal(60)]),
])
type BybitTimeframeMinutesQuantifier = t.TypeOf<
  typeof BybitTimeframeMinutesQuantifier
>

const BybitTimeframeHoursQuantifier = t.intersection([Int, t.literal(1)])
type BybitTimeframeHoursQuantifier = t.TypeOf<
  typeof BybitTimeframeHoursQuantifier
>

const BybitTimeframeDaysQuantifier = t.intersection([Int, t.literal(1)])
type BybitTimeframeDaysQuantifier = t.TypeOf<
  typeof BybitTimeframeDaysQuantifier
>

const BybitTimeframeWeeksQuantifier = t.intersection([Int, t.literal(1)])
type BybitTimeframeWeeksQuantifier = t.TypeOf<
  typeof BybitTimeframeWeeksQuantifier
>

/**
 * BybitTimeframes
 */

const BybitTimeframeMinutes = t.type({
  quantifier: BybitTimeframeMinutesQuantifier,
  unit: t.literal('minute'),
})
type BybitTimeframeMinutes = t.TypeOf<typeof BybitTimeframeMinutes>

const BybitTimeframeHours = t.type({
  quantifier: BybitTimeframeHoursQuantifier,
  unit: t.literal('hour'),
})
type BybitTimeframeHours = t.TypeOf<typeof BybitTimeframeHours>

const BybitTimeframeDays = t.type({
  quantifier: BybitTimeframeDaysQuantifier,
  unit: t.literal('day'),
})
type BybitTimeframeDays = t.TypeOf<typeof BybitTimeframeDays>

const BybitTimeframeWeeks = t.type({
  quantifier: BybitTimeframeWeeksQuantifier,
  unit: t.literal('week'),
})
type BybitTimeframeWeeks = t.TypeOf<typeof BybitTimeframeWeeks>

export const BybitTimeframe = t.union([
  BybitTimeframeMinutes,
  BybitTimeframeHours,
  BybitTimeframeDays,
  BybitTimeframeWeeks,
])
export type BybitTimeframe = t.TypeOf<typeof BybitTimeframe>

const charEncoded = (unit: BybitTimeframeUnit) => {
  switch (unit) {
    case 'minute':
      return ''
    case 'hour':
      return 'H'
    case 'day':
      return 'D'
    case 'week':
      return 'W'
  }
}

const minutesInMinute = 1
const minutesInHour = 60
const minutesInDay = 60 * 24
const minutesInWeek = 60 * 24 * 7

const multiplier = (
  unit: BybitTimeframeUnit,
): BybitTimeframeMinutesQuantifier => {
  switch (unit) {
    case 'minute':
      return minutesInMinute as BybitTimeframeMinutesQuantifier
    case 'hour':
      return minutesInHour as BybitTimeframeMinutesQuantifier
    case 'day':
      return minutesInDay as BybitTimeframeMinutesQuantifier
    case 'week':
      return minutesInWeek as BybitTimeframeMinutesQuantifier
  }
}

export const inMinutes = (a: BybitTimeframe): BybitTimeframeMinutesQuantifier =>
  (a.quantifier * multiplier(a.unit)) as BybitTimeframeMinutes['quantifier']

// Represent a timeframe with the greatest `unit` property possible
const withGreatestUnit = (a: BybitTimeframe): BybitTimeframe => {
  const minutes = inMinutes(a)
  if (0 === minutes % minutesInWeek) {
    return {
      quantifier: (minutes / minutesInWeek) as BybitTimeframeWeeksQuantifier,
      unit: 'week',
    }
  } else if (0 === minutes % minutesInDay) {
    return {
      quantifier: (minutes / minutesInDay) as BybitTimeframeDaysQuantifier,
      unit: 'day',
    }
  } else if (0 === minutes % minutesInHour) {
    return {
      quantifier: (minutes / minutesInHour) as BybitTimeframeHoursQuantifier,
      unit: 'hour',
    }
  } else {
    return { quantifier: minutes, unit: 'minute' }
  }
}

export const BybitTimeframeFromString = new t.Type<
  BybitTimeframe,
  string,
  unknown
>(
  'BybitTimeframeFromString',
  BybitTimeframe.is,
  (u, c) => {
    const parser = pipe(
      Parser,
      P.chainFirst(() => P.eof()),
    )
    return pipe(
      t.string.validate(u, c),
      E.chain((s) =>
        pipe(
          run(parser, s),
          E.orElse(() => t.failure(u, c)),
        ),
      ),
      E.chain((ast) => BybitTimeframe.validate(ast, c)),
      E.map(withGreatestUnit),
    )
  },
  (timeframe) => [timeframe.quantifier, charEncoded(timeframe.unit)].join(''),
)
export type BybitTimeframeFromString = t.TypeOf<typeof BybitTimeframeFromString>

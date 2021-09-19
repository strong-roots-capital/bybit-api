import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import * as t from 'io-ts'
import * as P from 'parser-ts/Parser'
import * as C from 'parser-ts/char'
import { run } from 'parser-ts/code-frame'
import * as S from 'parser-ts/string'

import {
  BybitTimeframe,
  BybitTimeframeAst,
  BybitTimeframeFromString,
  Parser as bybitTimeframeParser,
} from '../BybitTimeframe'
import { BybitTradepair, Parser as bybitTradepairParser } from '../BybitTradepair'

const subscriptionRequestSeparator = '.' as const

/*********************************************************************
 * Parser combinators
 ********************************************************************/

type BybitKlineSubscriptionRequestAst = {
  channel: string
  interval: BybitTimeframeAst
  symbol: string
}

const constructBybitKlineSubscriptionRequestAst = ({
  interval,
  symbol,
}: Omit<
  BybitKlineSubscriptionRequestAst,
  'channel'
>): BybitKlineSubscriptionRequestAst => ({
  channel: 'klineV2',
  interval,
  symbol,
})

export const Parser = pipe(
  S.string('klineV2'),
  P.chain(() => C.char(subscriptionRequestSeparator)),
  P.chain(() => bybitTimeframeParser),
  P.bindTo('interval'),
  P.chainFirst(() => C.char(subscriptionRequestSeparator)),
  P.bind('symbol', () => bybitTradepairParser),
  P.map(constructBybitKlineSubscriptionRequestAst),
)

/*********************************************************************
 * Codecs
 ********************************************************************/

export const BybitKlineSubscriptionRequest = t.type({
  channel: t.literal('klineV2'),
  interval: BybitTimeframe,
  symbol: BybitTradepair,
})
export type BybitKlineSubscriptionRequest = t.TypeOf<
  typeof BybitKlineSubscriptionRequest
>

export const BybitKlineSubscriptionRequestFromString = new t.Type<
  BybitKlineSubscriptionRequest,
  string,
  unknown
>(
  'BybitKlineSubscriptionRequest',
  BybitKlineSubscriptionRequest.is,
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
      E.chain((ast) => BybitKlineSubscriptionRequest.validate(ast, c)),
    )
  },
  (request) =>
    [
      t.string.encode(request.channel),
      BybitTimeframeFromString.encode(request.interval),
      BybitTradepair.encode(request.symbol),
    ].join(subscriptionRequestSeparator),
)

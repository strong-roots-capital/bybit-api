/**
 * Note: currently only supports inverse perpetual swaps
 */

import * as util from 'util'

import { log } from '@strong-roots-capital/ratlog-debug'
import * as Console from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow, constVoid } from 'fp-ts/function'
import * as t from 'io-ts'
import { nonEmptyArray } from 'io-ts-types'
import * as PathReporter from 'io-ts/lib/PathReporter'
import D from 'od'
import { BehaviorSubject } from 'rxjs'
import { webSocket } from 'rxjs/webSocket'
import { match } from 'ts-pattern'
import WebSocket from 'ws'

import { BybitTimeframe } from './codecs/BybitTimeframe'
import { KlineResponse } from './codecs/rest/KlineResponse'
import { unsafeParse } from './codecs/unsafe-parse'
import { BybitChannelMessage } from './codecs/ws/BybitChannelMessage'
import { BybitKline } from './codecs/ws/BybitKline'
import {
  BybitKlineSubscriptionRequest,
  BybitKlineSubscriptionRequestFromString,
} from './codecs/ws/BybitKlineSubscriptionRequest'
import { BybitSubscriptionRequest } from './codecs/ws/BybitSubscriptionRequest'
import { BybitSubscriptionResponse } from './codecs/ws/BybitSubscriptionResponse'
import { BybitWebsocketMessage } from './codecs/ws/BybitWebsocketMessage'
import { bybitRestClient } from './rest'

const debug = {
  warn: log.tag('warning'),
  ws: log.tag('bybit:websocket'),
  kline: log.tag('bybit:kline'),
} as const

export type BybitPublicWebsocket = {
  subscribe(
    request: BybitKlineSubscriptionRequest,
  ): Promise<BehaviorSubject<BybitKline[]>>
}

export type BybitPublicWebsocketSettings = {
  testnet: boolean
}

const one = unsafeParse(t.Int, 1)

const wsKline = ({
  interval,
  kline,
  timestamp,
}: {
  interval: BybitTimeframe
  kline: KlineResponse
  timestamp: Date
}): BybitKline => {
  const end = D.add(interval.unit, interval.quantifier, kline.open_time)
  return {
    start: kline.open_time,
    end,
    open: kline.open,
    close: kline.close,
    high: kline.high,
    low: kline.low,
    volume: kline.volume,
    turnover: kline.turnover,
    timestamp,
    confirm: end < timestamp,
  }
}

const decodeBybitChannelMessage = (message: BybitWebsocketMessage) =>
  pipe(
    TE.fromEither(nonEmptyArray(BybitChannelMessage).decode(message.data)),
    TE.chainFirstIOK((_) => () => debug.kline(JSON.stringify(_))),
    TE.mapLeft(
      flow(
        (error) => PathReporter.failure(error),
        (errors) => ({
          type: 'unable to decode websocket message',
          error: errors.join('\n'),
        }),
      ),
    ),
  )

export const bybitPublicWebsocket = (
  settings: BybitPublicWebsocketSettings,
): BybitPublicWebsocket => {
  const subscribers: Map<
    t.OutputOf<typeof BybitSubscriptionRequest>,
    {
      initialized: boolean
      promise: Promise<void>
      subject: BehaviorSubject<BybitChannelMessage[]>
    }
  > = new Map()

  const pending: Map<
    t.OutputOf<typeof BybitSubscriptionRequest>,
    (value: BehaviorSubject<BybitChannelMessage[]>) => void
  > = new Map()

  const subject = webSocket<BybitChannelMessage>({
    url: settings.testnet
      ? 'wss://stream-testnet.bybit.com/realtime'
      : 'wss://stream.bybit.com/realtime',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    WebSocketCtor: WebSocket as any,
  })

  const restClient = bybitRestClient({
    testnet: settings.testnet,
  })

  async function subscribe(
    request: BybitKlineSubscriptionRequest,
  ): Promise<BehaviorSubject<BybitKline[]>>
  async function subscribe(request: BybitSubscriptionRequest) {
    return new Promise((resolve, reject) => {
      debug.ws(
        util.format(
          'Received request to subscribe to %s %s %s',
          request.channel,
          request.symbol,
          request.interval,
        ),
      )

      const encodedRequest = BybitSubscriptionRequest.encode(request)

      if (pending.has(encodedRequest) || subscribers.has(encodedRequest)) {
        reject({
          type: 'already subscribed to this websocket topic',
          stream: encodedRequest,
        })
      }

      pending.set(encodedRequest, resolve)

      // send the request to subscribe to bybit
      subject.next({
        op: 'subscribe',
        args: [encodedRequest],
        // Need to bypass the type system here because the subject
        // has no way to type input and output separately
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    })
  }

  // handle messages at the library level to implement inverse-multiplexing
  subject.subscribe({
    next: (message) => {
      // BybitWebsocketMessage.is is a "fromString" decoder, so we have to
      // decode before invoking the type-guard in the match statement below
      const decoded = t
        .union([BybitWebsocketMessage, BybitSubscriptionResponse, t.unknown])
        .decode(message)
      if (E.isLeft(decoded)) {
        throw new Error('absurd -- union of unknown will always decode')
      }

      match<unknown>(decoded.right)
        .when(BybitWebsocketMessage.is, async (message) =>
          pipe(
            TE.Do,
            TE.bind('topic', () => TE.of(message.topic)),
            TE.bind('data', () => decodeBybitChannelMessage(message)),
            TE.bindW('subscribee', () =>
              TE.fromEither(
                E.fromNullable({
                  type: 'cannot find a subscriber for this websocket topic',
                  topic: message.topic,
                })(
                  subscribers.get(
                    BybitKlineSubscriptionRequestFromString.encode(message.topic),
                  ),
                ),
              ),
            ),
            TE.fold(
              (error) =>
                T.fromIO(
                  Console.error(
                    'Error handling websocket data: ' + JSON.stringify(error),
                  ),
                ),
              ({ data, topic, subscribee }) => async () => {
                if (!subscribee.initialized) {
                  const openTime = pipe(
                    data[0].start,
                    D.subtract(topic.interval.unit, topic.interval.quantifier),
                  )
                  // sequence publication of the rest data
                  subscribee.promise = subscribee.promise.then(async () =>
                    // Note: Nobody is listening to these errors so they have to be fatal
                    pipe(
                      restClient.kline({
                        symbol: topic.symbol,
                        interval: topic.interval,
                        from: openTime,
                        limit: one,
                      }),
                      TE.fold(
                        (error) =>
                          T.fromIO(() => {
                            throw new Error(
                              'Unable to query most-recent complete candle: ' +
                                JSON.stringify(error),
                            )
                          }),
                        (response) =>
                          T.fromIO(() => {
                            const previousCandle = response.result.filter(
                              (kline) =>
                                kline.open_time.getTime() === openTime.getTime(),
                            )
                            if (!previousCandle[0]) {
                              throw new Error(
                                'Expected kline query to return previous candle',
                              )
                            }
                            subscribee.initialized = true
                            subscribee.subject.next([
                              wsKline({
                                interval: topic.interval,
                                kline: previousCandle[0],
                                timestamp: response.time_now,
                              }),
                            ])
                          }),
                      ),
                      async (invokeTask) => invokeTask(),
                    ),
                  )
                }

                // then sequence publication of the websocket data
                subscribee.promise = subscribee.promise.then(() =>
                  subscribee.subject.next(data),
                )

                return subscribee.promise
              },
            ),
            async (invokeTask) => invokeTask(),
          ),
        )
        .when(BybitSubscriptionResponse.is, (response) => {
          debug.ws(
            util.format(
              'Subscription handeshake complete for %s',
              JSON.stringify(response.request.args),
            ),
          )
          const resolver = O.fromNullable(pending.get(response.request.args[0]))
          pending.delete(response.request.args[0])

          const subject = new BehaviorSubject<BybitChannelMessage[]>([])
          pipe(
            resolver,
            O.map((resolve) => {
              subscribers.set(response.request.args[0], {
                initialized: false,
                promise: new Promise<void>((resolve) => resolve()),
                subject,
              })
              resolve(subject)
            }),
          )
        })
        .otherwise(() => debug.warn('unmatched message:', JSON.stringify(message)))
    },
    error: console.error,
    complete: constVoid,
  })

  return { subscribe }
}

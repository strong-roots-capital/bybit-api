/**
 * Note: currently only supports inverse perpetual swaps
 */

import { trace } from '@strong-roots-capital/trace'
import Debug from 'debug'
import * as Console from 'fp-ts/Console'
import * as E from 'fp-ts/Either'
import * as O from 'fp-ts/Option'
import * as T from 'fp-ts/Task'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow, constVoid } from 'fp-ts/function'
import * as t from 'io-ts'
import * as PathReporter from 'io-ts/lib/PathReporter'
import { BehaviorSubject } from 'rxjs'
import { webSocket } from 'rxjs/webSocket'
import { match } from 'ts-pattern'
import WebSocket from 'ws'

import { BybitKlineSubscriptionRequest } from './codecs/BybitKlineSubscriptionRequest'
import { BybitSubscriptionRequest } from './codecs/BybitSubscriptionRequest'
import { BybitChannelMessage } from './codecs/ws/BybitChannelMessage'
import { BybitKline } from './codecs/ws/BybitKline'
import { BybitSubscriptionResponse } from './codecs/ws/BybitSubscriptionResponse'
import { BybitWebsocketMessage } from './codecs/ws/BybitWebsocketMessage'

const debug = {
  ws: Debug('bybit:websocket'),
  kline: Debug('bybit:kline'),
} as const

export type BybitPublicWebsocket = {
  subscribe(
    request: BybitKlineSubscriptionRequest,
  ): Promise<BehaviorSubject<BybitKline[]>>
}

export type BybitPublicWebsocketSettings = {
  testnet: boolean
}

export const bybitPublicWebsocket = (
  settings: BybitPublicWebsocketSettings,
): BybitPublicWebsocket => {
  const subscribers: Map<
    t.OutputOf<typeof BybitSubscriptionRequest>,
    BehaviorSubject<BybitChannelMessage[]>
  > = new Map()

  const pending: Map<
    t.OutputOf<typeof BybitSubscriptionRequest>,
    (value: BehaviorSubject<BybitChannelMessage[]>) => void
  > = new Map()

  const subject = webSocket<BybitChannelMessage>({
    url: settings.testnet
      ? 'wss://stream-testnet.bybit.com/realtime'
      : 'wss://stream.bybit.com/realtime',
    WebSocketCtor: WebSocket,
  })

  async function subscribe(
    request: BybitKlineSubscriptionRequest,
  ): Promise<BehaviorSubject<BybitKline[]>>
  async function subscribe(request: BybitSubscriptionRequest) {
    return new Promise((resolve, reject) => {
      debug.ws(
        'Received request to subscribe to %s %s %s',
        request.channel,
        request.tradepair,
        request.timeframe,
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
  subject.subscribe(
    (message) =>
      match<unknown>(message)
        .when(BybitWebsocketMessage.is, async (message) =>
          pipe(
            TE.Do,
            TE.bind('data', () =>
              pipe(
                TE.fromEither(
                  t.array(BybitChannelMessage).decode(message.data),
                ),
                TE.bimap(
                  flow(
                    (error) => PathReporter.failure(error),
                    (errors) => ({
                      type: 'unable to decode websocket message',
                      error: errors.join('\n'),
                    }),
                  ),
                  trace(debug.kline),
                ),
              ),
            ),
            // TODO: provide an error message if the subscribee dne
            TE.bindW('subscribee', () =>
              TE.fromEither(
                E.fromNullable({
                  type: 'cannot find a subscriber for this websocket topic',
                  topic: message.topic,
                })(subscribers.get(message.topic)),
              ),
            ),
            TE.fold(
              (error) =>
                T.fromIO(
                  Console.error(
                    'Error handling websocket data: ' + JSON.stringify(error),
                  ),
                ),
              ({ data, subscribee }) => T.fromIO(() => subscribee.next(data)),
            ),
            async (invokeTask) => invokeTask(),
          ),
        )
        .when(BybitSubscriptionResponse.is, (response) => {
          debug.ws(
            'Subscription handeshake complete for %s',
            JSON.stringify(response.request.args),
          )
          const resolver = O.fromNullable(pending.get(response.request.args[0]))
          pending.delete(response.request.args[0])
          // TODO: use REST api to fetch candles and pre-load the ws stream
          // NOTE: DO NOT fetch the REST data in parallel with the WS open response
          const stream = new BehaviorSubject<BybitChannelMessage[]>([])
          pipe(
            resolver,
            O.map((resolve) => {
              subscribers.set(response.request.args[0], stream)
              resolve(stream)
            }),
          )
        })
        .otherwise(() =>
          console.warn('unmatched message:', JSON.stringify(message)),
        ),
    console.error,
    constVoid,
  )

  return { subscribe }
}

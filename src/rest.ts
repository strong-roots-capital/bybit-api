import * as util from 'util'

import { log } from '@strong-roots-capital/ratlog-debug'
import Axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import * as E from 'fp-ts/Either'
import * as R from 'fp-ts/Record'
import * as TE from 'fp-ts/TaskEither'
import { pipe, flow } from 'fp-ts/function'
import * as t from 'io-ts'
import * as PathReporter from 'io-ts/lib/PathReporter'

import { AxiosResponse as AxiosResponseC } from './codecs/rest/AxiosResponse'
import { BybitRestKlineRequest } from './codecs/rest/BybitRestKlineRequest'
import { BybitRestKlineResponse } from './codecs/rest/BybitRestKlineResponse'
import { BybitRestMessage } from './codecs/rest/BybitRestMessage'

const debug = {
  request: log.tag('bybit:rest:request'),
  response: log.tag('bybit:rest:response'),
} as const

type BybitUnexpectedRequestError = {
  type: 'unexpected http request'
  request: unknown
}

type BybitHttpRequestError = { type: 'http request error'; error: Error }

type BybitUnexpectedResponseError = {
  type: 'unable to parse http response'
  response: unknown
  error: string
}

export type BybitRestApiError =
  | BybitUnexpectedRequestError
  | BybitHttpRequestError
  | BybitUnexpectedResponseError

type BybitPublicRestClientConfig = {
  testnet: boolean
  url: string
  requestTimeoutMS: number
}

/**
 * Defaults to testnet
 */
const defaultBybitRestClientConfig: BybitPublicRestClientConfig = {
  testnet: true,
  url: 'https://api-testnet.bybit.com/',
  requestTimeoutMS: 5000,
}

type BybitApiEndpoint<A extends t.Mixed, B extends t.Mixed> = {
  request: A
  response: B
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BybitRestApiRequest<T> = T extends BybitApiEndpoint<infer A, any>
  ? t.TypeOf<A>
  : never

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BybitRestApiResponse<T> = T extends BybitApiEndpoint<any, infer A>
  ? BybitRestMessage<t.TypeOf<A>>
  : never

const PublicRestApi = {
  kline: {
    method: 'get',
    resource: 'v2/public/kline/list',
    request: BybitRestKlineRequest,
    response: BybitRestKlineResponse,
  },
} as const
type PublicRestApi = typeof PublicRestApi

type BybitPublicRestApiClient = {
  [A in keyof PublicRestApi]: (
    request: BybitRestApiRequest<PublicRestApi[A]>,
  ) => TE.TaskEither<BybitRestApiError, BybitRestApiResponse<PublicRestApi[A]>>
}

export type BybitRestClient = BybitPublicRestApiClient

// Avoid `decode` because we want to supply A, not I
const validateRequestFormat = <C extends t.Mixed>(codec: C) => (
  request: unknown,
): E.Either<BybitUnexpectedRequestError, t.TypeOf<C>> =>
  E.fromPredicate(
    codec.is,
    (): BybitUnexpectedRequestError => ({
      type: 'unexpected http request',
      request,
    }),
  )(request)

const httpRequest = <C extends t.Mixed>({
  axios,
  request,
  requestCodec,
  method,
  resource,
}: {
  axios: AxiosInstance
  request: t.TypeOf<C>
  requestCodec: C
  method: 'get'
  resource: string
}): TE.TaskEither<BybitHttpRequestError, AxiosResponse<unknown>> =>
  pipe(
    TE.fromIO<void, never>(() =>
      debug.request(util.format('%s %s', resource, JSON.stringify(request))),
    ),
    TE.chain(() =>
      TE.tryCatch(
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        async () => axios[method](resource, { params: requestCodec.encode(request) }),
        flow(
          E.toError,
          (error): BybitHttpRequestError => ({
            type: 'http request error',
            error,
          }),
        ),
      ),
    ),
  )

const decodeResponse = <C extends t.Mixed>(codec: C) => (response: unknown) =>
  pipe(
    TE.fromEither(AxiosResponseC(codec).decode(response)),
    TE.chainFirstIOK((_) => () => debug.response(JSON.stringify(_.data))),
    TE.bimap(
      flow(
        PathReporter.failure,
        (errors): BybitUnexpectedResponseError => ({
          type: 'unable to parse http response',
          response,
          error: errors.join('\n'),
        }),
      ),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      (_) => _.data,
    ),
  )

export const bybitRestClient = (
  clientConfig: Partial<BybitPublicRestClientConfig> &
    Pick<BybitPublicRestClientConfig, 'testnet'>,
): BybitRestClient => {
  const config = Object.assign({}, defaultBybitRestClientConfig, clientConfig)
  const axios = Axios.create({
    baseURL: config.url,
    timeout: config.requestTimeoutMS,
  })

  const publicApi = pipe(
    PublicRestApi,
    R.map(
      ({ method, resource, request: requestCodec, response: responseCodec }) => (
        request: t.TypeOf<typeof requestCodec>,
      ): TE.TaskEither<
        BybitRestApiError,
        BybitRestMessage<t.TypeOf<typeof responseCodec>>
      > =>
        pipe(
          TE.fromEither(validateRequestFormat(requestCodec)(request)),
          TE.chainW(() =>
            httpRequest({
              axios,
              request,
              requestCodec,
              method,
              resource,
            }),
          ),
          TE.chainW(decodeResponse(BybitRestMessage(responseCodec))),
          TE.map((value) => value),
        ),
    ),
  )

  return publicApi
}

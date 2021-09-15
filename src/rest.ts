import Debug from 'debug'
import * as t from 'io-ts'
import * as TE from 'fp-ts/TaskEither'
import * as E from 'fp-ts/Either'
import * as R from 'fp-ts/Record'
import { pipe, flow } from 'fp-ts/function'
import Axios from 'axios'
import type { AxiosInstance, AxiosResponse } from 'axios'
import * as PathReporter from 'io-ts/lib/PathReporter'

import { KlineRequest } from './codecs/rest/KlineRequest'
import { KlineResponse } from './codecs/rest/KlineResponse'
import { BybitRestMessage } from './codecs/rest/BybitRestMessage'
import { AxiosResponse as AxiosResponseC } from './codecs/rest/AxiosResponse'

const debug = {
  request: Debug('bybit:rest:request'),
  response: Debug('bybit:rest:request'),
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
  ? t.TypeOf<A>
  : never

const PublicRestApi = {
  kline: {
    method: 'get',
    resource: 'v2/public/kline/list',
    request: KlineRequest,
    response: KlineResponse,
  },
} as const
type PublicRestApi = typeof PublicRestApi

type BybitPublicRestApiClient = {
  [A in keyof PublicRestApi]: (
    request: BybitRestApiRequest<PublicRestApi[A]>,
  ) => TE.TaskEither<BybitRestApiError, BybitRestApiResponse<PublicRestApi[A]>>
}

type BybitRestClient = BybitPublicRestApiClient

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
}): TE.TaskEither<BybitHttpRequestError, AxiosResponse<unknown>> => {
  const params = requestCodec.encode(request)
  return pipe(
    TE.fromIO<void, never>(() => debug.request('%s %s', resource, params)),
    TE.chain(() =>
      TE.tryCatch(
        () => axios[method](resource, { params }),
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
}

const decodeResponse = <C extends t.Mixed>(codec: C) => (response: unknown) =>
  pipe(
    TE.fromEither(codec.decode(response)),
    TE.chainFirstIOK((_) => () => debug.response('%s', _.data)),
    TE.bimap(
      flow(
        PathReporter.failure,
        (errors): BybitUnexpectedResponseError => ({
          type: 'unable to parse http response',
          response,
          error: errors.join('\n'),
        }),
      ),
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
      ({
        method,
        resource,
        request: requestCodec,
        response: responseCodec,
      }) => (
        request: t.TypeOf<typeof requestCodec>,
      ): TE.TaskEither<BybitRestApiError, t.TypeOf<typeof responseCodec>> =>
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
          TE.chainW(
            decodeResponse(AxiosResponseC(BybitRestMessage(responseCodec))),
          ),
        ),
    ),
  )

  return publicApi
}

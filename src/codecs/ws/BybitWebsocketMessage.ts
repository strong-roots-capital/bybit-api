import * as t from 'io-ts'
import { nonEmptyArray } from 'io-ts-types'

import { BybitKlineSubscriptionRequestFromString } from './BybitKlineSubscriptionRequest'

export const BybitWebsocketMessage = t.type({
  topic: BybitKlineSubscriptionRequestFromString,
  data: nonEmptyArray(t.UnknownRecord),
})
export type BybitWebsocketMessage = t.TypeOf<typeof BybitWebsocketMessage>

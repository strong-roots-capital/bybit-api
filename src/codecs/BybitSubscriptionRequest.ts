import * as t from 'io-ts'

import { BybitKlineSubscriptionRequestFromString } from './BybitKlineSubscriptionRequest'

export const BybitSubscriptionRequest = BybitKlineSubscriptionRequestFromString
export type BybitSubscriptionRequest = t.TypeOf<typeof BybitSubscriptionRequest>

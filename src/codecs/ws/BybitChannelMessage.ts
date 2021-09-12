import * as t from 'io-ts'

import { BybitKline } from './BybitKline'

export const BybitChannelMessage = BybitKline
export type BybitChannelMessage = t.TypeOf<typeof BybitChannelMessage>

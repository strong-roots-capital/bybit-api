import * as t from 'io-ts'

import { BybitWebsocketKline } from './BybitWebsocketKline'

export const BybitChannelMessage = BybitWebsocketKline
export type BybitChannelMessage = t.TypeOf<typeof BybitChannelMessage>

import * as t from 'io-ts'
import { nonEmptyArray } from 'io-ts-types'

export const BybitWebsocketMessage = t.type({
  topic: t.string,
  data: nonEmptyArray(t.UnknownRecord),
})

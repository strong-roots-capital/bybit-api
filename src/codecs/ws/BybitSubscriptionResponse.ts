import * as t from 'io-ts'
import { UUID } from 'io-ts-types'

export const BybitSubscriptionResponse = t.type({
  success: t.boolean,
  ret_msg: t.string,
  conn_id: UUID,
  request: t.type({
    op: t.literal('subscribe'),
    args: t.tuple([t.string]),
  }),
})

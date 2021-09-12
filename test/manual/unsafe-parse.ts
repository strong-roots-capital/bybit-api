import * as E from 'fp-ts/Either'
import { pipe } from 'fp-ts/function'
import * as t from 'io-ts'

// TODO: use a curry function to keep the implementation clean

export function unsafeParse<C extends t.Mixed>(
  codec: C,
): (value: unknown) => t.TypeOf<C>
export function unsafeParse<C extends t.Mixed>(
  codec: C,
  value: unknown,
): t.TypeOf<C>
/**
 * Decode value with codec or `throw`.
 *
 * Note: you must swear to only call this function at the top-level scope,
 * i.e. it must run as soon as program execution begins. Otherwise
 * we risk throwing in the middle of program execution.
 */
export function unsafeParse<C extends t.Mixed>(
  codec: C,
  value?: unknown,
): t.TypeOf<C> | ((value: unknown) => t.TypeOf<C>) {
  const work = (value: unknown): t.TypeOf<C> =>
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    pipe(
      codec.decode(value),
      E.getOrElseW(() => {
        throw new Error(
          `ParseError: unable to decode ${value} into type ${codec.name}`,
        )
      }),
    )
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return value === undefined ? work : work(value)
}

/**
 * Follows the same rules as the debug npm package.
 */

// TODO: pull this into its own package
// NOTE: ratlog is a peer dependency

import ratlog, { Ratlogger } from 'ratlog'

// TODO: memoize, size 1
const parseDebug = (): readonly string[] => {
  if (process.env.DEBUG === null || process.env.DEBUG === undefined) {
    return []
  }
  return process.env.DEBUG.split(',')
}

// TODO: memoize, size 10
const debugEnabled = (tag: string) =>
  parseDebug().some((regex) => new RegExp(regex).test(tag))

export const log: Ratlogger = ratlog.logger((log) => {
  const defaultTags = ['warn', 'warning', 'error']
  if (
    log.tags.length === 0 ||
    log.tags
      .map((_) => _.toString())
      .concat(defaultTags)
      .some(debugEnabled)
  ) {
    process.stdout.write(ratlog.stringify(log))
  }
})

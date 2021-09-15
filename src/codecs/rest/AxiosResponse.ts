import * as t from 'io-ts'

export const AxiosResponse = <C extends t.Mixed>(codec: C) =>
  t.type(
    {
      status: t.Int,
      statusText: t.string,
      headers: t.UnknownRecord,
      config: t.UnknownRecord,
      request: t.UnknownRecord,
      data: codec,
    },
    'AxiosResponse',
  )

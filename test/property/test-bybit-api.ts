import { testProp, fc } from 'ava-fast-check'

import { bybitApi } from '../../src/index'

testProp.skip(
    'TODO: property-test bybit-api',
    [
        // arbitraries
        fc.nat(),
    ],
    (
        t,
        // test arguments
        natural,
    ) => {
        // ava test here
    },
    {
        verbose: true,
    },
)

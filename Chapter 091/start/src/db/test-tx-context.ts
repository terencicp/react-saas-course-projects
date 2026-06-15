import { AsyncLocalStorage } from 'node:async_hooks';

import type { Transaction } from '@/db';

// The async-local store that threads the current per-test rollback Transaction from a
// `withRollback` body into the `@/db` mock's Proxy. This file lives under src/db/ for
// import locality but is used ONLY by the test harness — no production file imports it.
//
// Stored on globalThis so the single instance is shared even if the module is evaluated
// more than once across the test graph (the mock and withRollback must see the same
// store). The `??=` idiom is forbidden by Biome's noAssignInExpressions, so the lazy
// init is split into two statements.
const globalForTx = globalThis as typeof globalThis & {
  __testTxContext?: AsyncLocalStorage<Transaction>;
};

if (!globalForTx.__testTxContext) {
  globalForTx.__testTxContext = new AsyncLocalStorage<Transaction>();
}

export const testTxContext = globalForTx.__testTxContext;

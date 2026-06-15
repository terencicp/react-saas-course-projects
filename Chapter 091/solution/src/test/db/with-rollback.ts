import type { Transaction } from '@/db';
import { testTxContext } from '@/db/test-tx-context';
import { getTestDb } from '@/test/db/worker-db';

// A private sentinel thrown to force the per-test transaction to roll back. Catching it
// (and ONLY it) is how withRollback discards every write the test and the route made —
// the suite runs green twice with no reset and leaves zero rows behind.
class RollbackSignal extends Error {
  constructor() {
    super('__rollback__');
    this.name = 'RollbackSignal';
  }
}

type RollbackBody = (ctx: { tx: Transaction }) => Promise<void>;

// Wrap a test body so its DB work — and the SUT route's own db.transaction, which joins
// the same tx via the @/db mock — all run inside one transaction that is rolled back at
// the end. Used as: it('…', withRollback(async ({ tx }) => { … })).
//
// The body runs inside testTxContext.run(tx, …) so the @/db Proxy resolves `db` to this
// tx. After the body completes we throw RollbackSignal; the catch swallows ONLY that
// signal and rethrows everything else — the one catch a helper must never make
// swallow-all (a real assertion failure must still fail the test).
export const withRollback =
  (body: RollbackBody): (() => Promise<void>) =>
  async () => {
    try {
      await getTestDb().transaction(async (tx) => {
        await testTxContext.run(tx as Transaction, async () => {
          await body({ tx: tx as Transaction });
          throw new RollbackSignal();
        });
      });
    } catch (error) {
      if (error instanceof RollbackSignal) {
        return;
      }
      throw error;
    }
  };

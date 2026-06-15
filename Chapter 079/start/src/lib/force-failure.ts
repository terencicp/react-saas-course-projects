import 'server-only';

// A tiny userId-keyed flag the inspector arms and the wizard action consumes.
// When armed for a user, the next `createCustomer` for that user returns an
// `internal` error after a short delay and writes no audit row, then the flag
// auto-clears (`consume` reads-and-removes). Backed by `globalThis` for the
// same reason the store is: the inspector's arm-action and the wizard's submit
// action run in separately bundled graphs that must share one set.

const holder = globalThis as typeof globalThis & {
  __forceFailureUsers?: Set<string>;
};

holder.__forceFailureUsers ??= new Set<string>();

const forced = holder.__forceFailureUsers;

export const armForceFailure = (userId: string): void => {
  forced.add(userId);
};

// Read-and-clear: returns whether the flag was set for this user, removing it so
// only the next submit fails.
export const consumeForceFailure = (userId: string): boolean => {
  if (!forced.has(userId)) {
    return false;
  }
  forced.delete(userId);
  return true;
};

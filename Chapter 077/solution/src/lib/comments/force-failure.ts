import 'server-only';

// The inspector's "Force 500 on next POST" flag. A per-user one-shot: arming it
// makes the *next* `addCommentAction` for that user return an `internal` Result
// and write no audit row, then auto-clears. Backed by `globalThis` so the
// inspector action (which arms it) and the comment action (which consumes it)
// reach the same Map even though the bundler emits them in separate module
// graphs.
const holder = globalThis as typeof globalThis & {
  __forceFailNextPost?: Map<string, true>;
};

holder.__forceFailNextPost ??= new Map();

const flags: Map<string, true> = holder.__forceFailNextPost;

export const armForceFailure = (userId: string): void => {
  flags.set(userId, true);
};

// Read-and-clear: returns true at most once per arm.
export const consumeForceFailure = (userId: string): boolean => {
  if (flags.get(userId)) {
    flags.delete(userId);
    return true;
  }
  return false;
};

export const isForceFailureArmed = (userId: string): boolean =>
  flags.get(userId) === true;

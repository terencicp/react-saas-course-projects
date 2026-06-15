// The dev cookie that swaps the acting identity in /inspector. Read by the
// seed-aware identity resolver the slices wire. Lives outside actions.ts because a
// 'use server' module may only export async functions, never plain constants.
export const ACTING_USER_COOKIE = 'inspector-acting-user';

// The dev cookie that swaps the acting identity in /inspector. Read by the
// seed-aware identity resolver the slices wire. Lives outside actions.ts because a
// 'use server' module may only export async functions, never plain constants.
export const ACTING_USER_COOKIE = 'inspector-acting-user';

// The three notifiable event types the inspector's fire buttons dispatch. Kept here
// (not in actions.ts) because a 'use server' module may export only async functions.
// The literals become real EventType members once S1 lands the registry.
export const FIREABLE_TYPES = [
  'org.invitation.sent',
  'org.member.role_changed',
  'org.billing.past_due',
] as const;
export type FireableType = (typeof FIREABLE_TYPES)[number];

import type { NotifiableEvent } from './types';

// TODO(L2) — three notifiableEvents entries (team/team/billing), as const satisfies Record<string, NotifiableEvent>; org.billing.past_due carries criticalChannel:'email'
export const notifiableEvents = {} as const satisfies Record<
  string,
  NotifiableEvent
>;

export type EventType = keyof typeof notifiableEvents;

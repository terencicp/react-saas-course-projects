import BillingPastDueEmail from '@/emails/BillingPastDueEmail';
import InviteSentEmail from '@/emails/InviteSentEmail';
import RoleChangedEmail from '@/emails/RoleChangedEmail';

import type { NotifiableEvent } from './types';

// The registry is the source of truth: it enumerates what is notifiable and how. Adding
// an event is one entry; adding a channel later is one function of the same signature.
// `as const satisfies Record<string, NotifiableEvent>` makes an unknown key a compile
// error and infers EventType. Each entry's email template declares its own typed payload —
// the permissive `(props: any) => ReactElement` field accepts every one. The inbox
// formatter renders title/body from the payload (frozen onto the row at dispatch). The
// dedup window is per-event; org.billing.past_due names email its critical channel so it
// flows even when the user toggled billing email off.
export const notifiableEvents = {
  'org.invitation.sent': {
    channels: ['email', 'inbox'],
    templates: {
      email: InviteSentEmail,
      inbox: (payload) => ({
        title: `Invitation to ${String(payload.orgName)}`,
        body: `${String(payload.inviterName)} invited you to join ${String(payload.orgName)} as a ${String(payload.role)}.`,
      }),
    },
    preferenceCategory: 'team',
    dedup: { windowSeconds: 60, keyBy: ['subjectId'] },
    description: 'A member was invited to the organization.',
  },
  'org.member.role_changed': {
    channels: ['email', 'inbox'],
    templates: {
      email: RoleChangedEmail,
      inbox: (payload) => ({
        title: `Your role in ${String(payload.orgName)} changed`,
        body: `${String(payload.actorName)} changed your role from ${String(payload.before)} to ${String(payload.newRole)}.`,
      }),
    },
    preferenceCategory: 'team',
    dedup: { windowSeconds: 60, keyBy: ['subjectId', 'newRole'] },
    description: "A member's role in the organization changed.",
  },
  'org.billing.past_due': {
    channels: ['email', 'inbox'],
    templates: {
      email: BillingPastDueEmail,
      inbox: (payload) => ({
        title: `Payment past due for ${String(payload.orgName)}`,
        body: `The latest payment for ${String(payload.orgName)}'s ${String(payload.plan)} plan did not go through.`,
      }),
    },
    preferenceCategory: 'billing',
    criticalChannel: 'email',
    dedup: { windowSeconds: 60, keyBy: ['subjectId'] },
    description: 'An organization subscription went past due.',
  },
} as const satisfies Record<string, NotifiableEvent>;

export type EventType = keyof typeof notifiableEvents;

import type { ReactElement } from 'react';

import type { EventType } from './registry';

// The notification module's shared shapes. Every stub typechecks against these, and
// the finalized dispatcher/channels/prefs/registry implement them unchanged.

// The two delivery channels this project ships. `push` is reserved at the column but
// has no channel function, so it is not a ChannelName.
export type ChannelName = 'email' | 'inbox';

// The one options object every call site builds and `await dispatch(...)` consumes.
// `type` is keyed to the registry so an unknown event is a compile error; the empty
// stub registry makes EventType `never` until S1 lands the three entries.
export type NotificationEvent = {
  type: EventType;
  recipientUserIds: string[];
  subjectId: string;
  payload: Record<string, unknown>;
};

// The dispatcher's return value: a flat count summary, deliberately NOT a Result<T>
// and NOT per-channel. `sent` is a single running total incremented once per
// successful channel send.
export type DispatchResult = {
  sent: number;
  deduped: number;
  suppressedByPrefs: number;
};

// The minimal recipient identity a channel function receives.
export type Recipient = { userId: string };

// Content rendered ONCE per recipient in the dispatcher and frozen onto the inbox row
// / passed to the email template — so the inbox UI is a pure read with no joins,
// immune to later actor-name drift. `emailProps` is the typed props object the
// registry's email template is called with; `inbox` is the rendered title/body.
export type RenderedContent = {
  emailProps: Record<string, unknown>;
  inbox: { title: string; body: string };
  orgId: string | null;
};

// A registry entry: what is notifiable and how. The `templates.email` field is the
// permissive `(props: any) => ReactElement` form — NEVER
// `(props: Record<string, unknown>) => ReactElement` and never
// `ComponentType<Record<string, unknown>>`: each shipped template (InviteSentEmail
// etc.) declares its own typed payload, and a typed-prop component does not assign to
// a Record<string, unknown>-param field under TS 6 strict (parameter contravariance,
// TS2322). Only the any-prop form accepts every typed template AND stays callable with
// the rendered props.
// biome-ignore lint/suspicious/noExplicitAny: the permissive template prop form is required — see comment above.
type EmailTemplate = (props: any) => ReactElement;

export type NotifiableEvent = {
  channels: ChannelName[];
  templates: {
    email: EmailTemplate;
    inbox: (payload: Record<string, unknown>) => {
      title: string;
      body: string;
    };
  };
  preferenceCategory: string;
  dedup: { windowSeconds: number; keyBy: string[] };
  criticalChannel?: ChannelName;
  description: string;
};

// The uniform channel signature. Every channel is this exact shape, so the dispatcher
// loops `await channelFns[channel](args)` with no branch on channel name. A channel
// returns Promise<void>, never a Result<T>; an expected failure throws and the
// dispatcher's per-channel try/catch swallows it.
export type ChannelFn = (args: {
  recipient: Recipient;
  event: NotificationEvent;
  payload: Record<string, unknown>;
  rendered: RenderedContent;
}) => Promise<void>;

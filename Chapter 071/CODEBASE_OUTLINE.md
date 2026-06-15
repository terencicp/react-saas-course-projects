# Chapter 071 — Codebase Summary

## Solution file tree

```
src/
  lib/
    notifications/
      types.ts              — shared type definitions for the entire notifications module
      registry.ts           — the notifiable-event registry (source of truth for all events)
      dispatcher.ts         — the dispatch() seam: dedup → prefs → channel fan-out
      dedup.ts              — time-windowed dedup helpers: isDuplicate, recordDedup, computeDedupKey
      prefs.ts              — batched prefs read + channel resolution with default-on + critical override
      errors.ts             — NotificationError class (REGISTRY_MISS | RECIPIENT_NOT_FOUND)
      index.ts              — barrel: re-exports dispatch, EventType, DispatchResult, NotificationEvent
      get-user-email.ts     — resolve recipient email from Better Auth user table
      channels/
        email.ts            — sendEmailChannel: resolve address → render template → sendEmail
        inbox.ts            — writeInboxChannel: insert one notifications row
  emails/
    InviteSentEmail.tsx     — react-email template for org.invitation.sent
    RoleChangedEmail.tsx    — react-email template for org.member.role_changed
    BillingPastDueEmail.tsx — react-email template for org.billing.past_due
  db/
    schema.ts               — adds notifications, userNotificationPreferences, notificationDedup tables
  app/
    (protected)/
      inbox/
        page.tsx            — production inbox page: reads last 20 notifications, dev acting-user aware
        loading.tsx         — loading skeleton for inbox
      inspector/
        page.tsx            — notification inspector page: 8 bounded panels
        constants.ts        — ACTING_USER_COOKIE, FIREABLE_TYPES, FireableType
        actions.ts          — dev-only server actions: fireEvent, rapidFire, setPref, resetAndReseed, forceRegistryMiss, setEmailFailing, wrapInviteInRollback, switchUserAction
        _data.ts            — inspector read helpers: getInspectorContext, getNotificationInspectorContext, getLastDeduped/setLastDeduped/resetLastDeduped
        _components/
          fire-console.tsx          — fire buttons + dispatch-result panel
          prefs-panel.tsx           — per-category per-channel toggles (calls setPref)
          inbox-panel.tsx           — active user's notification tail
          counters-panel.tsx        — email-sent-counter + dedup-badge
          notification-debug-controls.tsx — force-registry-miss, make-email-fail, wrap-invite-rollback, reset-reseed
          acting-user-switcher.tsx  — dev switcher (carried from prior chapter)
          processed-events-tail.tsx — idempotency ledger tail (carried)
  lib/
    invitations/
      send.ts     — sendInvitation: dispatches org.invitation.sent after commit (call site S3)
      manage.ts   — changeMemberRole: dispatches org.member.role_changed after commit (call site S3)
    webhooks/
      stripe.ts   — dispatch() gains pendingDispatches: NotificationEvent[] param; onSubscriptionUpdated pushes org.billing.past_due descriptor when patch.status === 'past_due'
    email.ts      — sendEmail with EMAIL_MOCK mode: getEmailSentCount, resetEmailSentCount, setEmailShouldFail
  app/api/webhooks/stripe/
    route.ts      — POST: drains pendingDispatches after db.transaction commits (fire-after-commit)
drizzle/
  0011_add_notifications.sql  — creates notifications, user_notification_preferences, notification_dedup tables + indexes
tests/
  lessons/
    Lesson 2.test.ts  — todo stub: registry + dedup + dispatch (S1)
    Lesson 3.test.ts  — todo stub: channels + preferences (S2)
    Lesson 4.test.ts  — todo stub: three call sites wired (S3)
```

---

## Contracts

### `src/lib/notifications/types.ts`
```ts
type ChannelName = 'email' | 'inbox'

type NotificationEvent = {
  type: EventType
  recipientUserIds: string[]
  subjectId: string
  payload: Record<string, unknown>
}

type DispatchResult = {
  sent: number
  deduped: number
  suppressedByPrefs: number
}

type Recipient = { userId: string }

type RenderedContent = {
  emailProps: Record<string, unknown>
  inbox: { title: string; body: string }
  orgId: string | null
}

type NotifiableEvent = {
  channels: ChannelName[]
  templates: {
    email: (props: any) => ReactElement   // permissive — parameter contravariance (TS2322)
    inbox: (payload: Record<string, unknown>) => { title: string; body: string }
  }
  preferenceCategory: string
  dedup: { windowSeconds: number; keyBy: string[] }
  criticalChannel?: ChannelName
  description: string
}

type ChannelFn = (args: {
  recipient: Recipient
  event: NotificationEvent
  payload: Record<string, unknown>
  rendered: RenderedContent
}) => Promise<void>
```

### `src/lib/notifications/registry.ts`
```ts
export const notifiableEvents: Record<string, NotifiableEvent> // as const satisfies
// Entries:
//   'org.invitation.sent'      channels:['email','inbox'], preferenceCategory:'team',   dedup:{windowSeconds:60, keyBy:['subjectId']}
//   'org.member.role_changed'  channels:['email','inbox'], preferenceCategory:'team',   dedup:{windowSeconds:60, keyBy:['subjectId','newRole']}
//   'org.billing.past_due'     channels:['email','inbox'], preferenceCategory:'billing', dedup:{windowSeconds:60, keyBy:['subjectId']}, criticalChannel:'email'

export type EventType = keyof typeof notifiableEvents
// = 'org.invitation.sent' | 'org.member.role_changed' | 'org.billing.past_due'
```

### `src/lib/notifications/dispatcher.ts`
```ts
export const dispatch = async (event: NotificationEvent): Promise<DispatchResult>
// server-only
// Flow: registry lookup (REGISTRY_MISS if unknown) → readPrefsForCategory (batched)
//       → per-recipient: resolveChannels → isDuplicate → per-channel try/catch fan-out → recordDedup
```

### `src/lib/notifications/dedup.ts`
```ts
export const computeDedupKey = (event: NotificationEvent, payload: Record<string, unknown>): string
export const isDuplicate = (args: { event, userId, payload }): Promise<boolean>
export const recordDedup  = (args: { event, userId, payload }): Promise<void>
```

### `src/lib/notifications/prefs.ts`
```ts
export type NotificationPrefRow = typeof userNotificationPreferences.$inferSelect

export const readPrefsForCategory = (
  userIds: string[],
  category: string
): Promise<Map<string, NotificationPrefRow | undefined>>

export const resolveChannels = (
  event: NotifiableEvent,
  prefs: NotificationPrefRow | undefined
): ChannelName[]
// keeps channel when (prefs?.[channel] ?? true) || channel === event.criticalChannel
```

### `src/lib/notifications/errors.ts`
```ts
export class NotificationError extends Error {
  readonly code: 'REGISTRY_MISS' | 'RECIPIENT_NOT_FOUND'
  constructor(code: 'REGISTRY_MISS' | 'RECIPIENT_NOT_FOUND', message?: string)
}
```

### `src/lib/notifications/index.ts` (barrel)
```ts
export { dispatch } from './dispatcher'
export type { EventType } from './registry'
export type { DispatchResult, NotificationEvent } from './types'
```

### `src/lib/notifications/get-user-email.ts`
```ts
export const getUserEmail = async (userId: string): Promise<string | null>
```

### `src/lib/notifications/channels/email.ts`
```ts
export const sendEmailChannel: ChannelFn
// idempotencyKey: `${event.type}:${event.subjectId}:${recipient.userId}`
// throws NotificationError('RECIPIENT_NOT_FOUND') if getUserEmail returns null
```

### `src/lib/notifications/channels/inbox.ts`
```ts
export const writeInboxChannel: ChannelFn
// Only writer of the notifications table; inserts from rendered.inbox.title/body
```

### `src/db/schema.ts` — new tables added in Ch071

**`notifications`**
| column | type | notes |
|---|---|---|
| id | uuid PK | $defaultFn uuidv7() |
| userId | text NOT NULL | FK → user(id) cascade |
| orgId | text | FK → organization(id) cascade |
| eventType | text NOT NULL | |
| subjectId | text NOT NULL | |
| title | text NOT NULL | frozen at dispatch |
| body | text NOT NULL | frozen at dispatch |
| payload | jsonb NOT NULL DEFAULT {} | |
| readAt | timestamptz | null = unread |
| createdAt | timestamptz NOT NULL | |

Indexes: `idx_notifications_user_created` (userId, createdAt DESC), `idx_notifications_user_unread` (userId) WHERE read_at is null

**`user_notification_preferences`**
| column | type | notes |
|---|---|---|
| id | uuid PK | $defaultFn uuidv7() |
| userId | text NOT NULL | FK → user(id) cascade |
| category | text NOT NULL | |
| email | bool NOT NULL DEFAULT true | |
| inbox | bool NOT NULL DEFAULT true | |
| push | bool NOT NULL DEFAULT true | reserved, no channel |
| updatedAt | timestamptz NOT NULL | |

Unique: (userId, category)

**`notificationDedup`**
| column | type | notes |
|---|---|---|
| id | uuid PK | $defaultFn uuidv7() |
| eventType | text NOT NULL | |
| dedupKey | text NOT NULL | keyBy fields joined with ':' |
| recipientUserId | text NOT NULL | FK → user(id) cascade |
| firedAt | timestamptz NOT NULL DEFAULT now() | |

Index: `idx_notification_dedup_lookup` (eventType, dedupKey, recipientUserId, firedAt DESC)

Exported types: `Notification`, `NewNotification`, `UserNotificationPreference`, `NewUserNotificationPreference`, `NotificationDedup`, `NewNotificationDedup`

### `src/emails/InviteSentEmail.tsx`
```ts
export type InviteSentEmailProps = { orgName: string; inviterName: string; role: string; acceptUrl: string; invitedEmail: string }
export default InviteSentEmail  // react-email component, PreviewProps attached
```

### `src/emails/RoleChangedEmail.tsx`
```ts
export type RoleChangedEmailProps = { orgName: string; actorName: string; newRole: string; before: string }
export default RoleChangedEmail
```

### `src/emails/BillingPastDueEmail.tsx`
```ts
export type BillingPastDueEmailProps = { orgName: string; plan: string }
export default BillingPastDueEmail  // criticalChannel event, no unsubscribe footer
```

### `src/lib/email.ts`
```ts
export type SendInput = { to: string; subject: string; react: ReactNode; idempotencyKey: string; replyTo?: string; bypassSuppression?: boolean }
export const getEmailSentCount = (): number
export const resetEmailSentCount = (): void
export const setEmailShouldFail = (b: boolean): void
export const sendEmail = async (input: SendInput): Promise<Result<{ id: string }>>
// EMAIL_MOCK='1' short-circuits before Resend: increments emailSentCount, no IO
```

### `src/app/(protected)/inspector/constants.ts`
```ts
export const ACTING_USER_COOKIE = 'inspector-acting-user'
export const FIREABLE_TYPES = ['org.invitation.sent', 'org.member.role_changed', 'org.billing.past_due'] as const
export type FireableType = (typeof FIREABLE_TYPES)[number]
```

### `src/app/(protected)/inspector/_data.ts`
```ts
export const getInspectorContext = cache(async (): Promise<InspectorContext>)
export const getNotificationInspectorContext = cache(async (): Promise<NotificationInspectorContext>)
export const getLastDeduped = (): number
export const setLastDeduped = (count: number): void
export const resetLastDeduped = (): void
export type PrefRow = { category: string; email: boolean; inbox: boolean; push: boolean }
export type InboxTailRow = { id: string; eventType: string; title: string; body: string; createdAt: Date; readAt: Date | null }
export type NotificationInspectorContext = { userId; orgId; orgName; role; orgs; members; prefs: PrefRow[]; inbox: InboxTailRow[]; dedupCount: number; emailSentCount: number; processedEvents }
```

### `src/app/(protected)/inspector/actions.ts`
```ts
// All dev-only (isProd guard). 'use server', returns Result<T>.
export const switchUserAction = async (_prev, formData): Promise<Result<{ userId: string }>>
export const fireEvent        = async (type: FireableType): Promise<FireResult>
export const rapidFire        = async (type: FireableType): Promise<FireResult>
// rapidFire calls dispatch 5x and aggregates DispatchResult
export const setPref          = async (category, channel: 'email'|'inbox'|'push', value: boolean): Promise<Result<...>>
// UPSERT on (userId, category); no-op if table missing
export const resetAndReseed   = async (): Promise<Result<{ reseeded: true }>>
export const forceRegistryMiss = async (): Promise<Result<{ error: string }>>
export const setEmailFailing  = async (failing: boolean): Promise<Result<{ failing: boolean }>>
export const wrapInviteInRollback = async (): Promise<Result<{ note: string }>>
```

### `src/app/(protected)/inspector/_components/counters-panel.tsx`
```ts
export const CountersPanel = ({ emailSentCount: number, dedupCount: number }) => JSX
// data-testid="counters-panel", "email-sent-counter", "dedup-badge"
```

### `src/app/(protected)/inspector/_components/prefs-panel.tsx`
```ts
export const PrefsPanel = ({ prefs: PrefRow[] }) => JSX
// 'use client'; calls setPref; data-testid="prefs-panel", "pref-toggle-{category}-{channel}"
```

### `src/app/(protected)/inspector/_components/inbox-panel.tsx`
```ts
export const InboxPanel = ({ rows: InboxTailRow[] }) => JSX
// data-testid="inbox-panel", "inbox-empty", "inbox-row" (data-unread)
```

### `src/app/(protected)/inspector/_components/fire-console.tsx`
```ts
export const FireConsole = () => JSX
// 'use client'; calls fireEvent/rapidFire; data-testid="fire-console", "fire-invite-sent",
// "fire-role-changed", "fire-billing-past-due", "rapid-fire-invite-sent",
// "dispatch-result", "result-sent", "result-deduped", "result-suppressed"
```

### `src/app/(protected)/inspector/_components/notification-debug-controls.tsx`
```ts
export const NotificationDebugControls = () => JSX
// 'use client'; data-testid="debug-controls", "force-registry-miss", "make-email-fail",
// "wrap-invite-rollback", "reset-reseed"
```

### `src/app/(protected)/inbox/page.tsx`
```ts
export default InboxPage  // async RSC; reads last 20 notifications for session user
// data-testid="inbox-page", "inbox-page-empty", "inbox-page-list", "inbox-page-row" (data-unread)
// dev: respects ACTING_USER_COOKIE override
```

### `src/lib/invitations/send.ts`
```ts
export const sendInvitation  // authedAction('admin', ...)
// After commit: dispatch({ type:'org.invitation.sent', recipientUserIds: existingUser?[id]:[] })
```

### `src/lib/invitations/manage.ts`
```ts
export const changeMemberRole  // authedAction('admin', ...)
// After commit: dispatch({ type:'org.member.role_changed', recipientUserIds:[target.userId] })
```

### `src/lib/webhooks/stripe.ts`
```ts
export const dispatch = async (tx, event, pendingDispatches: NotificationEvent[]): Promise<void>
// onSubscriptionUpdated: if patch.status==='past_due', pushes org.billing.past_due descriptor
// into pendingDispatches array (collected inside tx, fired after commit by route.ts)
export const resolveOrgIdFromCustomer = async (tx, stripeCustomerId): Promise<string>
export const onCheckoutCompleted    = async (tx, event): Promise<void>
export const onSubscriptionUpdated  = async (tx, event, pendingDispatches): Promise<void>
export const onSubscriptionDeleted  = async (tx, event): Promise<void>
```

### `src/app/api/webhooks/stripe/route.ts`
```ts
export const POST = async (request: Request): Promise<Response>
// pendingDispatches: NotificationEvent[] captured by closure, drained with dispatchNotification after db.transaction
```

---

## Dependencies

From `package.json`:

**Runtime**
| Package | Version |
|---|---|
| next | 16.2.7 |
| react / react-dom | 19.2.4 |
| better-auth | ^1.6.14 |
| drizzle-orm | ^0.45.1 |
| postgres | ^3.4.7 |
| react-email | ^6.5.0 |
| resend | ^6.12.4 |
| stripe | ^22.2.0 |
| zod | ^4.4.3 |
| pino | ^9.14.0 |
| server-only | ^0.0.1 |
| uuidv7 | ^1.0.2 |
| @t3-oss/env-nextjs | ^0.13.11 |
| sonner | ^2.0.7 |
| radix-ui | ^1.4.3 |
| class-variance-authority | ^0.7.1 |
| clsx | ^2.1.1 |
| tailwind-merge | ^3.6.0 |
| next-themes | ^0.4.6 |
| lucide-react | ^1.17.0 |
| tw-animate-css | ^1.4.0 |

**Dev**
| Package | Version |
|---|---|
| typescript | ^6.0.3 |
| @biomejs/biome | 2.4.16 |
| vitest | ^4.1.8 |
| drizzle-kit | ^0.31.5 |
| tailwindcss | ^4.3.0 |
| tsx | ^4.20.0 |
| dotenv-cli | ^10.0.0 |
| babel-plugin-react-compiler | 1.0.0 |
| drizzle-zod | ^0.8.0 |
| drizzle-seed | ^0.3.1 |

---

## Start diff

The start codebase contains the notification module scaffold — all files exist but the implementation bodies are stubs. The solution fills them in across four lessons (S1–S3 correspond to Lessons 2–4).

### Files identical between start and solution (or pre-existing, unchanged by this chapter)
All billing, auth, email suppression, invitation accept, audit, dashboard, onboarding, UI components, config files (tsconfig, biome, drizzle.config, next.config, vitest.config, scripts) are identical.

### Files changed: start → solution

**`src/db/schema.ts`**
Start: the three notification tables (`notifications`, `user_notification_preferences`, `notification_dedup`) are commented out under a `// TODO(L2)` block.
Solution: all three tables are uncommented and fully defined with Drizzle columns, indexes, and exported types. `user` is added to imports.

**`src/lib/notifications/registry.ts`**
Start: `notifiableEvents = {}` (empty object), `EventType = never`.
Solution: three entries filled in with templates, channels, dedup windows, preferenceCategory; `EventType` is the three string literals.

**`src/lib/notifications/dispatcher.ts`**
Start: `dispatch` throws `'dispatch not implemented'` unconditionally.
Solution: full implementation — registry lookup, batched prefs read, render-once, per-recipient dedup + channel fan-out with per-channel try/catch, DispatchResult returned.

**`src/lib/notifications/dedup.ts`**
Start: `isDuplicate` always resolves `false`; `recordDedup` is a no-op.
Solution: real DB queries using `notificationDedup` table; `computeDedupKey` exported.

**`src/lib/notifications/prefs.ts`**
Start: `readPrefsForCategory` returns empty Map; `resolveChannels` returns all channels unchanged.
Solution: `readPrefsForCategory` does a real batched `WHERE userId IN (...) AND category = ?`; `resolveChannels` applies `?? true` default-on + criticalChannel override.

**`src/lib/notifications/channels/email.ts`**
Start: `sendEmailChannel` is a no-op stub.
Solution: real implementation — getUserEmail, render template via createElement, sendEmail with deterministic idempotencyKey, throws NotificationError on null address.

**`src/lib/notifications/channels/inbox.ts`**
Start: `writeInboxChannel` is a no-op stub.
Solution: inserts one row into `notifications` table from `rendered.inbox`.

**`src/lib/invitations/send.ts`**
Start: has `// TODO(L4)` comment; no dispatch call.
Solution: `TODO` removed; `dispatch({ type: 'org.invitation.sent', ... })` called after commit with `existingUser ? [existingUser.id] : []` as recipientUserIds.

**`src/lib/invitations/manage.ts`**
Start: has `// TODO(L4)` comment; no dispatch call; does not import `organization`.
Solution: `TODO` removed; reads org name from DB; calls `dispatch({ type: 'org.member.role_changed', recipientUserIds: [target.userId], ... })` after commit.

**`src/lib/webhooks/stripe.ts`**
Start: `dispatch(tx, event)` — two params. `onSubscriptionUpdated` has `// TODO(L4)` comment for past-due path. No `pendingDispatches` array.
Solution: `dispatch(tx, event, pendingDispatches: NotificationEvent[])` — three params. `onSubscriptionUpdated` receives `pendingDispatches` and pushes an `org.billing.past_due` descriptor when `patch.status === 'past_due'`. Imports `NotificationEvent` from `@/lib/notifications`.

**`src/app/api/webhooks/stripe/route.ts`**
Start: no `pendingDispatches` array; calls `dispatch(tx, event)` (two args); no post-transaction notification drain. `// TODO(L4)` comment present.
Solution: `pendingDispatches: NotificationEvent[]` captured by closure; `dispatch(tx, event, pendingDispatches)` (three args); after `db.transaction` resolves, drains `pendingDispatches` with `dispatchNotification(e)`.

**`drizzle/meta/_journal.json`**
Start: last migration is `0010`. Solution: adds migration `0011_add_notifications`.

**`drizzle/0011_add_notifications.sql`** — new file in solution only (does not exist in start).

**`tests/lessons/Lesson 2.test.ts`** — identical (`describe.todo`) in both.
**`tests/lessons/Lesson 3.test.ts`** — identical (`describe.todo`) in both.
**`tests/lessons/Lesson 4.test.ts`** — identical (`describe.todo`) in both.

### TODO comments in start (all removed in solution)

- `src/lib/notifications/registry.ts` — `// TODO(L2) — three notifiableEvents entries (team/team/billing), as const satisfies Record<string, NotifiableEvent>; org.billing.past_due carries criticalChannel:'email'`
- `src/lib/notifications/dispatcher.ts` — `// TODO(L2) — registry lookup ...; TODO(L3) — batched prefs read + resolveChannels + render-once + channelFns fan-out`
- `src/lib/notifications/dedup.ts` — `// TODO(L2) — isDuplicate (select most-recent row in window), recordDedup (insert one row), computeDedupKey (join keyBy with ':')`
- `src/lib/notifications/channels/inbox.ts` — `// TODO(L3) — writeInboxChannel: insert one notifications row from rendered.inbox, no joins`
- `src/lib/notifications/channels/email.ts` — `// TODO(L3) — sendEmailChannel: getUserEmail (null → RECIPIENT_NOT_FOUND), render template, sendEmail with deterministic idempotencyKey; no unsubscribe header`
- `src/lib/notifications/prefs.ts` — `// TODO(L3) — readPrefsForCategory (one batched IN query → Map), resolveChannels (?? true default-on, || criticalChannel override)`
- `src/db/schema.ts` — `// TODO(L2) — uncomment + complete notifications / user_notification_preferences / notification_dedup per the shapes above; pnpm db:generate --name add_notifications`
- `src/lib/invitations/send.ts` — `// TODO(L4) — after commit: resolve invitee by email, await dispatch('org.invitation.sent', ...)`
- `src/lib/invitations/manage.ts` — `// TODO(L4) — after commit: await dispatch('org.member.role_changed', [affectedUserId], payload before/after)`
- `src/lib/webhooks/stripe.ts` — `// TODO(L4) — past-due path: on patch.status === 'past_due', read the org's owner user ids inside tx and push an org.billing.past_due descriptor onto the closure-captured pendingDispatches array route.ts dispatches after commit`
- `src/app/api/webhooks/stripe/route.ts` — `// TODO(L4) — past-due path: onSubscriptionUpdated collects owner ids inside the tx into a closure array; route.ts dispatches org.billing.past_due after db.transaction commits`

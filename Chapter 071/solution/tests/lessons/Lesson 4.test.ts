import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Lesson 4 gate — wiring the three call sites (S3). The notification dispatcher
// is taken off the inspector's direct-fire demo and onto the three production
// surfaces it exists to serve: the invite action, the role-change action, and
// the Stripe past-due webhook — each the same `await withTenant(...)`-then-
// `await dispatch(...)` move, fired only AFTER the action's transaction commits.
//
// Two of the three call sites (sendInvitation, changeMemberRole) run behind
// authedAction, which resolves a Better Auth session through next/headers — not
// reachable from vitest's node env. For those we drive the dispatcher with the
// exact event shape the call site emits (the observable the registry/channels
// turn into rows + an email increment) and read the wiring back out of the call
// site's source (the dispatch sits after the commit, the empty-array no-op, the
// untouched audit write). The webhook handler is a plain function — we drive it
// directly with a real tx and a fixture past-due Subscription, then drain the
// collected descriptors exactly as the route does after the transaction commits.
//
// Node env, no DOM — it observes the rows that land, the email-mock counter, and
// the call-site source, never UI.
// ---------------------------------------------------------------------------

// The notification + tenant modules' first line is `import 'server-only'`, a
// marker that throws the instant it loads outside the React Server runtime.
// Vitest's node env is not that runtime, so we swap it for an empty module before
// the student's code loads. Harness concern only — it does not touch behaviour.
vi.mock('server-only', () => ({}));

// The webhook handler reaches @/lib/billing/stripe, which constructs the Stripe
// SDK at module-load time. We never make a network call (the past-due path does
// not re-fetch the Subscription — the event payload IS the Subscription), but the
// SDK constructor still runs, so a placeholder key in .env is enough.

// `@/lib/notifications`, `@/lib/webhooks/stripe`, and `@/db` validate `process.env`
// through `@/env` at module-load time and refuse to boot when a variable is missing.
// Vitest does not auto-load `.env`, so we load it here first. EMAIL_MOCK='1' (set in
// .env) makes the email channel a deterministic counter instead of a live send. The
// suite talks to the same local Postgres the app uses (the `app` database), so it
// must be running with this chapter's migration applied (`pnpm db:migrate`) and
// `pnpm db:seed` run — Acme's single owner (Alice) is the past-due fan-out fixture.
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only: the student's notification dispatch() through the module
// barrel, the webhook handler that collects the past-due descriptor, the db handle
// for a real transaction, the email mock's read hook, and the postgres driver to
// read the notifications table and sweep our rows.
const { dispatch } = await import('@/lib/notifications');
const { onSubscriptionUpdated } = await import('@/lib/webhooks/stripe');
const { db } = await import('@/db');
const { getEmailSentCount } = await import('@/lib/email');
const { default: postgres } = await import('postgres');

const sql = postgres(process.env.DATABASE_URL as string);

// Read a call-site source file relative to the project root, with line comments
// stripped. Two of the three call sites cannot be driven through their authedAction
// wrapper from node env, so the suite confirms the wiring (dispatch-after-commit, the
// empty-array no-op, the untouched audit write) by reading the source the student
// edits. Comments are stripped first so the `// TODO(L4) — ... dispatch(...)` markers
// the student replaces are NOT mistaken for the real call — the gate must fail while
// only the TODO is present. A file: URL base handles the space in "Chapter 071".
const readSource = (rel: string) =>
  readFileSync(
    new URL(rel, new URL('../../', import.meta.url)),
    'utf8',
  ).replace(/\/\/.*$/gm, '');

// Seeded fixtures. Alice is Acme's lone owner (the past-due fan-out target) and a
// real FK-resolving user with no preference row (default-on, so every channel runs).
// notifications.userId and notification_dedup.recipientUserId both FK → user(id), so
// dispatching to a non-existent id would make the inbox insert fail inside the
// per-channel try/catch and skew the row count.
const ALICE = 'user_alice';
const ACME = 'org_acme';

// A fresh namespace per run so each subjectId (the dedup key for the invite +
// billing events) never collides with a previous run's 60s window, and so afterAll
// can sweep every row this suite created.
const NS = `l4probe_${Date.now()}`;
let seq = 0;
const freshSubject = (tag: string) => `${NS}_${tag}_${seq++}`;

const inboxRowsFor = (subjectId: string) =>
  sql<{ user_id: string; event_type: string }[]>`
    select user_id, event_type from notifications where subject_id = ${subjectId}`;

// The org.invitation.sent event the sendInvitation call site builds. For an existing
// user recipientUserIds is [existingUser.id]; for a non-user invitee it is [].
const inviteEvent = (recipientUserIds: string[], subjectId: string) => ({
  type: 'org.invitation.sent' as const,
  recipientUserIds,
  subjectId,
  payload: {
    invitedEmail: 'newcomer@acme.test',
    role: 'member',
    orgName: 'Acme',
    inviterName: 'Alice',
    acceptUrl: 'https://acme.example/accept-invite?id=probe',
  },
});

// The org.member.role_changed event the changeMemberRole call site builds.
const roleChangedEvent = (recipientUserId: string, subjectId: string) => ({
  type: 'org.member.role_changed' as const,
  recipientUserIds: [recipientUserId],
  subjectId,
  payload: {
    newRole: 'admin',
    before: 'member',
    orgName: 'Acme',
    actorName: 'Alice',
  },
});

// A minimal past_due Subscription the webhook projects onto the entitlement. The
// projection reads sub.items.data[0].price.lookup_key (mapped to a plan via the
// catalog), current_period_end, quantity, and cancel_at_period_end — so those are
// the only fields the fixture needs. course_pro_monthly → 'pro' in catalog.json.
const pastDueSubscription = (subscriptionId: string) =>
  ({
    id: subscriptionId,
    status: 'past_due',
    cancel_at_period_end: false,
    items: {
      data: [
        {
          price: { lookup_key: 'course_pro_monthly' },
          current_period_end: 1_900_000_000,
          quantity: 1,
        },
      ],
    },
    metadata: {},
  }) as never;

// A customer.subscription.updated event wrapping that Subscription. event.created
// becomes the high-water mark (lastEventAt); a far-future timestamp guarantees the
// ordering predicate (lastEventAt < event.created) lets the update through.
const pastDueEvent = (subscriptionId: string) =>
  ({
    id: `evt_${subscriptionId}`,
    type: 'customer.subscription.updated',
    created: 1_900_000_000,
    data: { object: pastDueSubscription(subscriptionId) },
  }) as never;

// Point Acme's entitlement row at a known subscription id so the handler's
// `WHERE subscription_id = sub.id` UPDATE matches it. Returns the subscription id,
// which doubles as the event's subjectId. lastEventAt is left null so the ordering
// predicate (isNull OR lastEventAt < created) admits our event.
const pointAcmeAt = async (subscriptionId: string) => {
  await sql`
    update plan_entitlements
       set subscription_id = ${subscriptionId},
           status = 'active',
           plan = 'pro',
           last_event_at = null
     where organization_id = ${ACME}`;
};

// Restore Acme's entitlement row to the seeded free/active/no-subscription shape so a
// rerun (or a later test) starts from the fixture, not from this run's mutation.
const restoreAcmeEntitlement = () => sql`
  update plan_entitlements
     set subscription_id = null, status = 'active', plan = 'free', last_event_at = null
   where organization_id = ${ACME}`;

const emailCount = () => getEmailSentCount();

beforeEach(async () => {
  await restoreAcmeEntitlement();
});

afterAll(async () => {
  // Sweep every notifications / dedup row this suite wrote, keyed by the run
  // namespace and by the past-due subject ids (which start with the namespace too),
  // and restore the entitlement fixture.
  await sql`delete from notifications where subject_id like ${`${NS}_%`}`;
  await sql`delete from notification_dedup where dedup_key like ${`${NS}_%`}`;
  await restoreAcmeEntitlement();
  await sql.end();
});

// Requirement 1 — sendInvitation to an existing user writes the invitation, commits,
// then dispatches one inbox row plus one email for the invitee. The action runs
// behind authedAction (a session-bound path node env cannot enter), so we drive the
// dispatcher with the existing-user event the call site builds and confirm the call
// site fires it after the withTenant commit.
describe('sendInvitation to an existing user notifies that user', () => {
  it('produces one inbox row and one email increment for the invitee', async () => {
    const subjectId = freshSubject('invite_existing');
    const before = emailCount();

    const result = await dispatch(inviteEvent([ALICE], subjectId));

    const rows = await inboxRowsFor(subjectId);
    expect(
      rows.length,
      `An invite to an EXISTING user must land exactly one org.invitation.sent inbox row for that user. Found ${rows.length}. In send.ts the dispatch call must run with recipientUserIds: existingUser ? [existingUser.id] : [], and the inbox channel must insert one row.`,
    ).toBe(1);
    expect(
      rows[0]?.user_id,
      `The invite inbox row must be addressed to the existing user (${ALICE}), not anyone else. Got ${JSON.stringify(rows[0]?.user_id)}.`,
    ).toBe(ALICE);

    expect(
      emailCount() - before,
      `An existing-user invite must increment the email channel exactly once (the EMAIL_MOCK counter). Delta was ${emailCount() - before}. If 0, dispatch is not being called for the existing-user branch.`,
    ).toBe(1);

    expect(
      result.sent,
      `One existing-user recipient over two channels (email + inbox) is sent: 2. Got ${result.sent}.`,
    ).toBe(2);
  });

  it('fires the dispatcher after the withTenant transaction commits', () => {
    const src = readSource('src/lib/invitations/send.ts');
    const tenantAt = src.indexOf('withTenant');
    const dispatchAt = src.indexOf('dispatch(');
    expect(
      tenantAt,
      'send.ts must use withTenant to write the invitation inside a transaction.',
    ).toBeGreaterThan(-1);
    expect(
      dispatchAt,
      'send.ts must call dispatch(...) for org.invitation.sent — the TODO(L4) must be replaced with the dispatcher call. The seam, not the call site, owns sending.',
    ).toBeGreaterThan(-1);
    expect(
      dispatchAt,
      'The dispatch(...) call must sit AFTER the withTenant(...) block, never inside it — notifying for state that could still roll back is the exact failure mode the seam prevents (fire-after-commit).',
    ).toBeGreaterThan(tenantAt);
  });
});

// Requirement 2 — inviting a non-user address no-ops the dispatcher: the call site
// passes an empty recipient list, the dispatcher loops over zero recipients, and no
// inbox row lands and the email counter stays flat. Only chapter 065's invitation
// email (a separate sendEmail outside the seam) sends, which this suite does not
// exercise.
describe('inviting a non-user address no-ops the dispatcher', () => {
  it('writes no inbox row and leaves the email counter flat on an empty recipient list', async () => {
    const subjectId = freshSubject('invite_nonuser');
    const before = emailCount();

    const result = await dispatch(inviteEvent([], subjectId));

    const rows = await inboxRowsFor(subjectId);
    expect(
      rows.length,
      `A non-user invitee means recipientUserIds is [], so the dispatcher must write NO inbox row — an empty recipient list is a clean no-op, not an error. Found ${rows.length}.`,
    ).toBe(0);

    expect(
      emailCount() - before,
      `With an empty recipient list the dispatcher fires no channel, so the EMAIL_MOCK counter stays flat (delta 0). Delta was ${emailCount() - before}.`,
    ).toBe(0);

    expect(
      result,
      `Dispatching to zero recipients must resolve cleanly to { sent: 0, deduped: 0, suppressedByPrefs: 0 }. Got ${JSON.stringify(result)}.`,
    ).toEqual({ sent: 0, deduped: 0, suppressedByPrefs: 0 });
  });

  it('builds the recipient list as the existing-user-or-empty ternary', () => {
    const src = readSource('src/lib/invitations/send.ts');
    const normalized = src.replace(/\s+/g, ' ');
    expect(
      normalized,
      'send.ts must pass recipientUserIds as `existingUser ? [existingUser.id] : []` so a non-user invitee dispatches to no one (the empty-array no-op) rather than guarding at the call site.',
    ).toMatch(
      /recipientUserIds:\s*existingUser\s*\?\s*\[\s*existingUser\.id\s*\]\s*:\s*\[\s*\]/,
    );
  });
});

// Requirement 3 — changeMemberRole writes both an auditLogs row and a notifications
// row for the affected member. The audit write lives inside the withTenant tx and is
// left untouched; the dispatch runs after commit. We drive the dispatcher with the
// role-change event the call site builds (the notifications + email half) and confirm
// the call site keeps logAudit inside the tx AND dispatches after it (the dual write).
describe('changeMemberRole writes both an audit row and a notification', () => {
  it('produces one inbox row and one email increment for the affected member', async () => {
    // Alice has no team preference row, so default-on holds and both channels run.
    // (Bob is seeded with team email off — using him would suppress the email half
    // and make this assert the preference fixture, not the call-site wiring.)
    const subjectId = freshSubject('role_changed');
    const before = emailCount();

    const result = await dispatch(roleChangedEvent(ALICE, subjectId));

    const rows = await inboxRowsFor(subjectId);
    expect(
      rows.length,
      `A role change must dispatch one org.member.role_changed inbox row to the affected member. Found ${rows.length}. The dispatch call in manage.ts must run after the withTenant commit.`,
    ).toBe(1);
    expect(
      rows[0]?.event_type,
      `The role-change inbox row must carry eventType 'org.member.role_changed'. Got ${JSON.stringify(rows[0]?.event_type)}.`,
    ).toBe('org.member.role_changed');

    expect(
      emailCount() - before,
      `A role change must increment the email channel once for the affected member. Delta was ${emailCount() - before}.`,
    ).toBe(1);

    expect(
      result.sent,
      `One recipient over two channels is sent: 2. Got ${result.sent}.`,
    ).toBe(2);
  });

  it('keeps the audit-log write inside the tx and dispatches after commit', () => {
    const src = readSource('src/lib/invitations/manage.ts');
    const tenantAt = src.indexOf('withTenant');
    const auditAt = src.indexOf('logAudit(');
    const dispatchAt = src.indexOf('dispatch(');
    expect(
      auditAt,
      'manage.ts must keep its logAudit(tx, ...) write — both auditLogs and notifications must write, so the audit row is left untouched.',
    ).toBeGreaterThan(-1);
    expect(
      dispatchAt,
      'manage.ts must call dispatch(...) for org.member.role_changed — the TODO(L4) must be replaced with the dispatcher call.',
    ).toBeGreaterThan(-1);
    expect(
      auditAt > tenantAt && auditAt < dispatchAt,
      `The logAudit write must stay INSIDE withTenant (it co-transacts with the role change) while dispatch fires AFTER the commit. Expected order: withTenant < logAudit < dispatch. Got indices withTenant=${tenantAt}, logAudit=${auditAt}, dispatch=${dispatchAt}.`,
    ).toBe(true);
  });
});

// Requirement 4 — the Stripe past-due transition lands the webhook, commits, then
// dispatches one inbox row plus one email per org owner. The handler is collect-only:
// inside the tx it reads the owner ids and PUSHES an org.billing.past_due descriptor
// onto the closure-captured pendingDispatches array; the route drains that array with
// the dispatcher after the transaction commits. We drive the handler with a real tx
// and a fixture Subscription, then drain the array exactly as the route does.
describe('the past-due webhook fans out to every org owner after commit', () => {
  it('collects an owner-targeted descriptor and dispatching it lands one inbox row + email per owner', async () => {
    const subscriptionId = freshSubject('pastdue');
    await pointAcmeAt(subscriptionId);

    const before = emailCount();
    const pendingDispatches: import('@/lib/notifications').NotificationEvent[] =
      [];

    // Run the handler inside a real transaction, exactly as route.ts does (the
    // handler reads owner ids inside tx but must NOT dispatch there). The tx commits
    // when this callback resolves.
    await db.transaction(async (tx) => {
      await onSubscriptionUpdated(
        tx as never,
        pastDueEvent(subscriptionId),
        pendingDispatches,
      );
    });

    expect(
      pendingDispatches.length,
      `On the past_due transition the handler must PUSH exactly one org.billing.past_due descriptor onto pendingDispatches (collect-only, read owners inside tx). Found ${pendingDispatches.length}. If 0, the past-due path is still the TODO(L4) stub or the status check is wrong.`,
    ).toBe(1);

    const descriptor = pendingDispatches[0];
    expect(
      descriptor?.type,
      `The collected descriptor must be of type 'org.billing.past_due'. Got ${JSON.stringify(descriptor?.type)}.`,
    ).toBe('org.billing.past_due');
    expect(
      descriptor?.recipientUserIds,
      `The descriptor must target Acme's owner user ids (Alice is the lone seeded owner), read INSIDE the tx so they reflect the committed transition. Got ${JSON.stringify(descriptor?.recipientUserIds)}.`,
    ).toEqual([ALICE]);
    expect(
      descriptor?.subjectId,
      `The descriptor's subjectId must be the subscription id (${subscriptionId}) — the dedup key for org.billing.past_due. Got ${JSON.stringify(descriptor?.subjectId)}.`,
    ).toBe(subscriptionId);

    // Drain the collected descriptors with the dispatcher exactly as the route does
    // AFTER db.transaction resolves. Nothing should have been dispatched before now.
    const rowsBeforeDrain = await inboxRowsFor(subscriptionId);
    expect(
      rowsBeforeDrain.length,
      `The handler must NOT dispatch inside the tx — no inbox row may exist before the route drains pendingDispatches. Found ${rowsBeforeDrain.length}. The handler is collect-only; dispatching is the route's job after commit.`,
    ).toBe(0);

    for (const e of pendingDispatches) {
      await dispatch(e);
    }

    const rows = await inboxRowsFor(subscriptionId);
    expect(
      rows.length,
      `Draining the past-due descriptor must land one inbox row per org owner (Acme has one owner, Alice). Found ${rows.length}.`,
    ).toBe(1);
    expect(
      rows[0]?.user_id,
      `The past-due inbox row must be addressed to the org owner (${ALICE}). Got ${JSON.stringify(rows[0]?.user_id)}.`,
    ).toBe(ALICE);

    expect(
      emailCount() - before,
      `Past-due is a criticalChannel:'email' event, so draining it must increment the email channel once per owner (one owner → delta 1). Delta was ${emailCount() - before}.`,
    ).toBe(1);
  });
});

// Requirement 5 — the fire-after-commit guarantee: a rolled-back action notifies
// nobody. Because the handler only COLLECTS descriptors inside the tx and the route
// drains them AFTER db.transaction resolves, a transaction that rolls back leaves the
// entitlement unchanged AND writes no notification row — the drain simply never runs.
// We run the handler inside a tx that throws (forcing rollback) and confirm nothing
// landed: no inbox row, no email increment, and the entitlement is back to its seed.
describe('a rolled-back action notifies nobody', () => {
  it('writes no inbox row and bumps no email counter when the transaction rolls back', async () => {
    const subscriptionId = freshSubject('rollback');
    await pointAcmeAt(subscriptionId);

    const before = emailCount();
    const pendingDispatches: import('@/lib/notifications').NotificationEvent[] =
      [];

    // Roll the transaction back AFTER the handler has run and collected its
    // descriptor. The route's drain loop runs only once db.transaction resolves —
    // here it throws, so the drain never happens. This is the whole point of
    // collect-inside / dispatch-after: rolled-back state never notifies.
    const rollback = new Error('forced rollback');
    await expect(
      db.transaction(async (tx) => {
        await onSubscriptionUpdated(
          tx as never,
          pastDueEvent(subscriptionId),
          pendingDispatches,
        );
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    // The past-due path must actually be wired — the handler collected its descriptor
    // in memory inside the tx (proving this is the fire-after-commit guarantee under
    // test, not a stub that simply never dispatches). If this is 0 the past-due path
    // is unimplemented and the "no rows" check below would pass vacuously.
    expect(
      pendingDispatches.length,
      `The past-due path must collect its org.billing.past_due descriptor inside the tx (so the fire-after-commit guarantee is what's under test, not an unwired handler). Found ${pendingDispatches.length}.`,
    ).toBe(1);

    // The handler collected its descriptor in memory — but because the tx rolled
    // back, the route must NOT drain it. Crucially, NO notification row may exist,
    // because the handler never dispatched inside the tx.
    const rows = await inboxRowsFor(subscriptionId);
    expect(
      rows.length,
      `A rolled-back action must notify nobody — no notifications row may exist. Found ${rows.length}. A row here means the handler dispatched INSIDE the transaction (the fire-after-commit violation this requirement guards against) instead of only collecting.`,
    ).toBe(0);

    expect(
      emailCount() - before,
      `A rolled-back action must bump no email counter. Delta was ${emailCount() - before}. A non-zero delta means a channel fired inside the rolled-back transaction.`,
    ).toBe(0);

    // The rollback must also have reverted the entitlement write itself — confirming
    // the transaction really did roll back (so the "no rows" result above is the
    // fire-after-commit guarantee, not a fixture fluke).
    const [ent] = await sql<{ status: string }[]>`
      select status from plan_entitlements where organization_id = ${ACME}`;
    expect(
      ent?.status,
      `The rolled-back transaction must leave the entitlement at its seeded 'active' status, not the 'past_due' the handler tried to write — proving the rollback took. Got ${JSON.stringify(ent?.status)}.`,
    ).toBe('active');
  });
});

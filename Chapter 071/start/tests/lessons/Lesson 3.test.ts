import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Lesson 3 gate — channels and preferences live (S2). The inbox channel now
// writes a real notifications row, the email channel bumps the EMAIL_MOCK
// counter, and a batched preference read decides which channels run per
// recipient: default-on for users with no row, off for a toggled channel, and
// always-on for an event's criticalChannel. This suite drives the student's
// public dispatch() against the same local Postgres + email mock the app uses,
// reading the notifications table and the email-sent counter directly to
// confirm what each channel did. Node env, no DOM — it observes effects and the
// DispatchResult, never UI.
// ---------------------------------------------------------------------------

// The notification module's first line is `import 'server-only'`, a marker that
// throws the instant it loads outside the React Server runtime. Vitest's node env
// is not that runtime, so we swap it for an empty module before the student's code
// loads. Harness concern only — it does not touch behaviour.
vi.mock('server-only', () => ({}));

// `@/lib/notifications` reaches `@/db` and `@/lib/email`, which validate `process.env`
// through `@/env` at module-load time and refuse to boot when a variable is missing.
// Vitest does not auto-load `.env`, so we load it here first. EMAIL_MOCK='1' (set in
// .env) is what makes the email channel a deterministic counter instead of a live send.
// The suite also talks to the same local Postgres the app uses (the `app` database), so
// it must be running with the Lesson 2 migration applied and `pnpm db:seed` run (Bob's
// team email-off row and Alice's missing row are the fixtures under test).
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only: the student's dispatch() through the module barrel, the email
// mock's read/control hooks (same module instance the email channel imports, so the
// counter is observable), and the postgres driver to read the notifications table and
// sweep our rows. We read the database directly (not through the student's `db` client)
// so the suite asserts the rows that landed, however they were wired.
const { dispatch } = await import('@/lib/notifications');
const { getEmailSentCount, setEmailShouldFail } = await import('@/lib/email');
const { default: postgres } = await import('postgres');

const sql = postgres(process.env.DATABASE_URL as string);

// Two real seeded recipients with opposite preference fixtures. Alice has NO
// user_notification_preferences row (the default-on target). Bob has a seeded team row
// with email off (the suppression target). Both are seeded by `pnpm db:seed` and both
// FK-resolve, so the inbox insert and the email-address lookup both succeed.
const ALICE = 'user_alice';
const BOB = 'user_bob';

// A fresh subject per fire so the dedup key (keyed by subjectId) never collides with a
// previous run's 60s window — without this a rerun within a minute would dedup and skew
// the counts. The shared namespace lets afterAll sweep every row this suite created.
const NS = `l3probe_${Date.now()}`;
let seq = 0;
const freshSubject = (tag: string) => `${NS}_${tag}_${seq++}`;

// The fixed payloads the inspector fires. subjectId is varied per test for isolation.
const inviteEvent = (recipient: string, subjectId: string) => ({
  type: 'org.invitation.sent' as const,
  recipientUserIds: [recipient],
  subjectId,
  payload: {
    invitedEmail: 'newcomer@acme.test',
    role: 'member',
    orgName: 'Acme',
    inviterName: 'Inspector',
    acceptUrl: 'https://acme.example/accept-invite?id=inspector',
  },
});

const billingEvent = (recipient: string, subjectId: string) => ({
  type: 'org.billing.past_due' as const,
  recipientUserIds: [recipient],
  subjectId,
  payload: { orgName: 'Acme', plan: 'pro' },
});

// The registry's inbox template for org.invitation.sent, inlined so the suite stays
// self-contained. Requirement 5 asserts the row's frozen title/body match this exactly.
const expectedInvite = (payload: {
  orgName: string;
  inviterName: string;
  role: string;
}) => ({
  title: `Invitation to ${payload.orgName}`,
  body: `${payload.inviterName} invited you to join ${payload.orgName} as a ${payload.role}.`,
});

const inboxRowsFor = (recipient: string, subjectId: string) =>
  sql<{ title: string; body: string; event_type: string }[]>`
    select title, body, event_type from notifications
    where user_id = ${recipient} and subject_id = ${subjectId}`;

// Helper: write a preference row for a (user, category). Used to set up the toggle and
// billing scenarios the seed leaves to the test. The id has no DB default (the app fills
// it with uuidv7()), so we generate one here.
const setPrefRow = (
  userId: string,
  category: string,
  channels: { email: boolean; inbox: boolean },
) => sql`
  insert into user_notification_preferences (id, user_id, category, email, inbox, push)
  values (gen_random_uuid(), ${userId}, ${category}, ${channels.email}, ${channels.inbox}, true)
  on conflict (user_id, category) do update
    set email = excluded.email, inbox = excluded.inbox`;

// Every test resets the email mock's fail flag so a leaked setEmailShouldFail(true) from
// the channel-independence test can never bleed into the next one.
beforeEach(() => {
  setEmailShouldFail(false);
});

afterAll(async () => {
  setEmailShouldFail(false);
  // Sweep every notifications row this suite wrote, keyed by the run namespace, and the
  // preference rows the toggle/billing tests added (Alice should end with no team row;
  // Bob's seeded team row is restored to its fixture value, his billing row removed).
  await sql`delete from notifications where subject_id like ${`${NS}_%`}`;
  await sql`delete from user_notification_preferences where user_id = ${ALICE} and category = 'team'`;
  await sql`delete from user_notification_preferences where user_id = ${BOB} and category = 'billing'`;
  await setPrefRow(BOB, 'team', { email: false, inbox: true });
  await sql.end();
});

// Requirement 1 — Bob has team email off, so an invite (a `team` event) fires the inbox
// channel only: one inbox row, the email counter unchanged, suppressedByPrefs counts the
// one dropped channel.
describe('a recipient with a channel toggled off has just that channel suppressed', () => {
  it('writes the inbox row, leaves the email counter flat, and reports suppressedByPrefs: 1', async () => {
    const subjectId = freshSubject('bob_invite');
    const before = getEmailSentCount();

    const result = await dispatch(inviteEvent(BOB, subjectId));

    expect(
      result.suppressedByPrefs,
      `Bob is seeded with team email off, so dispatching a team event (org.invitation.sent) must suppress exactly the email channel for him: suppressedByPrefs is 1. Got ${result.suppressedByPrefs}. resolveChannels should drop a channel when the user's pref row reads false, and the dispatcher should count (event.channels.length - resolvedChannels.length).`,
    ).toBe(1);

    expect(
      getEmailSentCount() - before,
      `With team email off, the email channel must NOT run for Bob — the EMAIL_MOCK counter stays flat (delta 0). It moved by ${getEmailSentCount() - before}. A non-zero delta means resolveChannels is ignoring the false pref and the email channel still sent.`,
    ).toBe(0);

    const rows = await inboxRowsFor(BOB, subjectId);
    expect(
      rows.length,
      `The inbox channel is NOT toggled off for Bob, so it must still write exactly one notifications row — channel suppression is per-channel, not all-or-nothing. Found ${rows.length}. If 0, the inbox channel is the no-op stub or was wrongly suppressed.`,
    ).toBe(1);
  });
});

// Requirement 2 — Alice has no preferences row, so default-on holds: both channels fire.
// One inbox row AND the email counter advances by one.
describe('a recipient with no preferences row receives every channel', () => {
  it('writes the inbox row and advances the email counter — default-on holds', async () => {
    const subjectId = freshSubject('alice_invite');
    const before = getEmailSentCount();

    const result = await dispatch(inviteEvent(ALICE, subjectId));

    expect(
      result.suppressedByPrefs,
      `Alice has no user_notification_preferences row, so the default-on rule must read every channel as on: nothing is suppressed (suppressedByPrefs 0). Got ${result.suppressedByPrefs}. A missing row must map to undefined in the prefs Map and default to on via "?? true" — silence-by-default is the bug this guards against.`,
    ).toBe(0);

    expect(
      getEmailSentCount() - before,
      `With no pref row, the email channel must run for Alice — the EMAIL_MOCK counter advances by exactly 1. Delta was ${getEmailSentCount() - before}. If 0, the email channel is still the no-op stub (it must call sendEmail), or default-on is not holding.`,
    ).toBe(1);

    const rows = await inboxRowsFor(ALICE, subjectId);
    expect(
      rows.length,
      `Default-on means the inbox channel runs for Alice too — exactly one notifications row. Found ${rows.length}. If 0, the inbox channel is the no-op stub (it must insert one row).`,
    ).toBe(1);
  });
});

// Requirement 3 — toggling Alice's team inbox off and refiring suppresses only the inbox
// channel: the email counter advances, no new inbox row lands.
describe('toggling one channel off suppresses only that channel', () => {
  it('with team inbox off, refiring advances the email counter but writes no inbox row', async () => {
    await setPrefRow(ALICE, 'team', { email: true, inbox: false });

    const subjectId = freshSubject('alice_inbox_off');
    const before = getEmailSentCount();

    try {
      const result = await dispatch(inviteEvent(ALICE, subjectId));

      expect(
        getEmailSentCount() - before,
        `Alice's team email is left on, so the email channel must still run — the counter advances by 1. Delta was ${getEmailSentCount() - before}. Toggling inbox off must not touch the email decision; each channel is resolved independently.`,
      ).toBe(1);

      const rows = await inboxRowsFor(ALICE, subjectId);
      expect(
        rows.length,
        `With team inbox set to false, the inbox channel must be suppressed for Alice — no notifications row is written. Found ${rows.length}. resolveChannels should drop the inbox channel when prefs.inbox is false.`,
      ).toBe(0);

      expect(
        result.suppressedByPrefs,
        `Exactly one channel (inbox) is toggled off, so suppressedByPrefs is 1. Got ${result.suppressedByPrefs}.`,
      ).toBe(1);
    } finally {
      // Restore Alice to the default-on fixture (no team row) so later Alice fires in this
      // file see both channels again — this test owns the mutation and must undo it.
      await sql`delete from user_notification_preferences where user_id = ${ALICE} and category = 'team'`;
    }
  });
});

// Requirement 4 — org.billing.past_due names email its criticalChannel, so even with
// billing email toggled off the email channel must still fire. The override lives inside
// resolveChannels, keeping a critical send flowing through a per-category opt-out.
describe('a critical channel ignores a per-category opt-out', () => {
  it('with billing email off, firing billing-past-due still advances the email counter', async () => {
    await setPrefRow(BOB, 'billing', { email: false, inbox: true });

    const subjectId = freshSubject('bob_billing');
    const before = getEmailSentCount();

    await dispatch(billingEvent(BOB, subjectId));

    expect(
      getEmailSentCount() - before,
      `org.billing.past_due declares email as its criticalChannel, so the email channel must fire even though Bob set billing email off — the counter advances by 1. Delta was ${getEmailSentCount() - before}. The override clause (channel === event.criticalChannel) belongs inside resolveChannels; if the counter stayed flat it is missing.`,
    ).toBe(1);
  });
});

// Requirement 5 — the inbox row's title/body are rendered from the registry template once
// at dispatch and frozen onto the row, so the inbox UI is a pure read. We assert the
// stored strings match the template output exactly.
describe('the inbox row freezes the registry-rendered title and body', () => {
  it('stores title and body matching the event template, written once at dispatch', async () => {
    const subjectId = freshSubject('alice_frozen');
    const event = inviteEvent(ALICE, subjectId);

    await dispatch(event);

    const rows = await inboxRowsFor(ALICE, subjectId);
    expect(
      rows.length,
      `Exactly one inbox row must land for this fire. Found ${rows.length}.`,
    ).toBe(1);

    const [row] = rows;
    const stored = { title: row?.title, body: row?.body };
    const expected = expectedInvite(
      event.payload as { orgName: string; inviterName: string; role: string },
    );
    expect(
      stored,
      `The inbox row's title/body must be rendered from the registry's inbox template for org.invitation.sent and frozen onto the row (not a live join). Stored ${JSON.stringify(
        stored,
      )}, expected ${JSON.stringify(
        expected,
      )}. The dispatcher should render eventDef.templates.inbox(payload) once and the inbox channel should write rendered.inbox.title/body verbatim.`,
    ).toEqual(expected);
  });
});

// Requirement 6 — channel independence. With the email mock forced to fail, the email
// channel throws inside the dispatcher's per-channel try/catch and is swallowed, while the
// inbox channel still writes its row.
describe('a failing email channel does not stop the inbox channel', () => {
  it('still writes the inbox row when the email send fails', async () => {
    setEmailShouldFail(true);

    const subjectId = freshSubject('alice_emailfail');
    const before = getEmailSentCount();

    // dispatch must not reject — a channel failure is swallowed per-channel, never bubbled.
    await expect(
      dispatch(inviteEvent(ALICE, subjectId)),
      `A failing email channel must not throw out of dispatch() — the per-channel try/catch swallows it so the other channels still run. dispatch() rejected instead. Wrap each channel call in its own try/catch.`,
    ).resolves.toBeDefined();

    expect(
      getEmailSentCount() - before,
      `With the email mock forced to fail, the email counter must NOT advance — the send failed. Delta was ${getEmailSentCount() - before}.`,
    ).toBe(0);

    const rows = await inboxRowsFor(ALICE, subjectId);
    expect(
      rows.length,
      `Channel independence: the email channel failing must not stop the inbox channel — the inbox row is still written (found ${rows.length}, expected 1). The fan-out must isolate each channel so one failure never kills the others.`,
    ).toBe(1);
  });
});

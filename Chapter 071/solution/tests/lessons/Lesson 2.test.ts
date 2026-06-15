import { afterAll, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Lesson 2 gate — the registry, the time-windowed dedup helper, and a callable
// dispatch() that collapses a burst of identical events down to one (S1). This
// suite drives the student's public dispatch() against the same local Postgres
// the app uses, and reads the dedup ledger directly to confirm what landed.
// Node env, no DOM — it observes the DispatchResult and the dedup rows, never UI.
// ---------------------------------------------------------------------------

// The notification module's first line is `import 'server-only'`, a marker that
// throws the instant it loads outside the React Server runtime. Vitest's node env
// is not that runtime, so we swap it for an empty module before the student's code
// loads. Harness concern only — it does not touch behaviour.
vi.mock('server-only', () => ({}));

// `@/lib/notifications` reaches `@/db`, which validates `process.env` through `@/env`
// at module-load time and refuses to boot when a variable is missing. Vitest does not
// auto-load `.env`, so we load it here first. The suite also talks to the same local
// Postgres the app uses (the `app` database), so it must be running with the Lesson 2
// migration applied (`pnpm db:migrate` after `pnpm db:generate --name add_notifications`).
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only: the student's dispatch() through the module barrel, plus the
// postgres driver so we can read the dedup ledger and sweep our rows afterwards. We
// read the database directly (not through the student's `db` client) so the suite does
// not depend on the schema being spread into `@/db` yet — it asserts the rows that
// landed, however they were wired.
const { dispatch } = await import('@/lib/notifications');
const { default: postgres } = await import('postgres');

const sql = postgres(process.env.DATABASE_URL as string);

// A real seeded recipient. notifications.userId and notification_dedup.recipientUserId
// both FK → user(id), so dispatching to a non-existent user id would make the inbox
// channel insert fail silently inside the per-channel try/catch and skew the `sent`
// count. user_alice is seeded by `pnpm db:seed`.
const RECIPIENT = 'user_alice';

// A fresh subject per run so the dedup key (keyed by subjectId for org.invitation.sent)
// never collides with a previous run's window, and a stable namespace so afterAll can
// sweep every dedup / notifications row this suite created.
const NS = `l2probe_${Date.now()}`;
const freshSubject = (tag: string) => `${NS}_${tag}`;

// The fixed org.invitation.sent payload the inspector fires, minus the subjectId which
// each test varies for isolation.
const inviteEvent = (subjectId: string) => ({
  type: 'org.invitation.sent' as const,
  recipientUserIds: [RECIPIENT],
  subjectId,
  payload: {
    invitedEmail: 'newcomer@acme.test',
    role: 'member',
    orgName: 'Acme',
    inviterName: 'Inspector',
    acceptUrl: 'https://acme.example/accept-invite?id=inspector',
  },
});

const dedupRowsFor = (subjectId: string) =>
  sql`select id, fired_at from notification_dedup
      where event_type = 'org.invitation.sent'
        and recipient_user_id = ${RECIPIENT}
        and dedup_key = ${subjectId}`;

afterAll(async () => {
  // Sweep everything this suite wrote, keyed by the run namespace.
  await sql`delete from notification_dedup where dedup_key like ${`${NS}_%`}`;
  await sql`delete from notifications where subject_id like ${`${NS}_%`}`;
  await sql.end();
});

// Requirement 2 — a first fire delivers to both channels, dedups nothing, and writes
// exactly one dedup row that marks the window as open.
describe('a first fire delivers and opens the dedup window', () => {
  it('returns { sent: 2, deduped: 0, suppressedByPrefs: 0 } and writes one dedup row', async () => {
    const subjectId = freshSubject('first');

    const result = await dispatch(inviteEvent(subjectId));

    expect(
      result,
      `A single org.invitation.sent to one recipient must fan out over both channels (email + inbox) with nothing deduped or suppressed, so the DispatchResult is { sent: 2, deduped: 0, suppressedByPrefs: 0 }. Got ${JSON.stringify(
        result,
      )}. If sent is 0 the dispatcher is still the "dispatch not implemented" stub; if it is the wrong number the per-channel fan-out or the count is off.`,
    ).toEqual({ sent: 2, deduped: 0, suppressedByPrefs: 0 });

    const rows = await dedupRowsFor(subjectId);
    expect(
      rows.length,
      `After a successful fan-out the dispatcher must record exactly one notification_dedup row for (eventType, dedupKey, recipientUserId) — got ${rows.length}. recordDedup should insert one row per recipient after the channels run.`,
    ).toBe(1);
  });
});

// Requirement 3 — firing the same event again inside the window collapses to a dedup,
// sends nothing, and adds no second dedup row.
describe('a refire inside the window is deduped', () => {
  it('returns deduped: 1 with no new send and no second dedup row', async () => {
    const subjectId = freshSubject('refire');

    await dispatch(inviteEvent(subjectId));
    const second = await dispatch(inviteEvent(subjectId));

    expect(
      second,
      `Firing the same (eventType, subjectId, recipient) again within the 60s window must collapse to one notification: no channels run, so the second DispatchResult is { sent: 0, deduped: 1, suppressedByPrefs: 0 }. Got ${JSON.stringify(
        second,
      )}. If deduped is 0, isDuplicate is not finding the row recorded by the first fire — check the dedup key (subjectId-based) and the window predicate.`,
    ).toEqual({ sent: 0, deduped: 1, suppressedByPrefs: 0 });

    const rows = await dedupRowsFor(subjectId);
    expect(
      rows.length,
      `A deduped fire must NOT record a second dedup row — the window stays anchored on the first fire. Found ${rows.length} rows; recordDedup should only run after a fan-out, never on the dedup-skip path.`,
    ).toBe(1);
  });
});

// Requirement 4 — five identical fires in a tight burst yield one delivery and four
// dedups when aggregated, the rage-fire-into-one-notification guarantee.
describe('a rapid burst of five collapses to one delivery', () => {
  it('aggregates to sent: 2, deduped: 4 across five fires', async () => {
    const subjectId = freshSubject('burst');
    const event = inviteEvent(subjectId);

    const aggregate = { sent: 0, deduped: 0, suppressedByPrefs: 0 };
    for (let i = 0; i < 5; i++) {
      const r = await dispatch(event);
      aggregate.sent += r.sent;
      aggregate.deduped += r.deduped;
      aggregate.suppressedByPrefs += r.suppressedByPrefs;
    }

    expect(
      aggregate,
      `Five identical fires in one window must deliver once and dedup the other four: aggregated that is { sent: 2, deduped: 4, suppressedByPrefs: 0 } (the one delivery fans out over two channels). Got ${JSON.stringify(
        aggregate,
      )}. A higher sent or lower deduped means the window is not holding across the burst.`,
    ).toEqual({ sent: 2, deduped: 4, suppressedByPrefs: 0 });

    const rows = await dedupRowsFor(subjectId);
    expect(
      rows.length,
      `A five-fire burst inside one window must leave exactly one dedup row, not five. Found ${rows.length}; only the first (non-duplicate) fire should record.`,
    ).toBe(1);
  });
});

// Requirement 5 — once the window has elapsed the next fire is a fresh delivery. We
// plant a dedup row stamped older than the window instead of waiting 61 real seconds:
// the constraint under test is the time-bound predicate (firedAt > now() - window), so
// a row outside the window must NOT dedup.
describe('a fire after the window has elapsed delivers fresh', () => {
  it('does not dedup against a row older than the 60s window', async () => {
    const subjectId = freshSubject('stale');

    // A prior fire whose dedup row landed 61 seconds ago — just outside the window.
    // The id column carries no DB default (the app fills it with uuidv7()), so we
    // generate one here rather than relying on the application-side default.
    await sql`
      insert into notification_dedup (id, event_type, dedup_key, recipient_user_id, fired_at)
      values (gen_random_uuid(), 'org.invitation.sent', ${subjectId}, ${RECIPIENT}, now() - interval '61 seconds')`;

    const result = await dispatch(inviteEvent(subjectId));

    expect(
      result,
      `A fire whose only prior dedup row is older than the 60s window must NOT be treated as a duplicate — the window has released, so this is a fresh delivery { sent: 2, deduped: 0, suppressedByPrefs: 0 }. Got ${JSON.stringify(
        result,
      )}. If deduped is 1, isDuplicate is missing the window predicate (firedAt > now() - make_interval(secs => windowSeconds)) and matching any historical row.`,
    ).toEqual({ sent: 2, deduped: 0, suppressedByPrefs: 0 });
  });
});

// Requirement 6 — an unknown event type is a programmer error that surfaces, never a
// silent no-op. The dispatcher throws NotificationError('REGISTRY_MISS') before the
// per-recipient loop, and that throw is never swallowed by the per-channel try/catch.
describe('an unknown event type surfaces a REGISTRY_MISS', () => {
  it('throws a NotificationError with code REGISTRY_MISS rather than returning silently', async () => {
    const unknownEvent = {
      // A type that is not in the registry. The dispatcher must reject it.
      type: 'org.unknown.event' as never,
      recipientUserIds: [RECIPIENT],
      subjectId: freshSubject('miss'),
      payload: {},
    };

    let thrown: unknown;
    let returned: unknown;
    try {
      returned = await dispatch(unknownEvent);
    } catch (e) {
      thrown = e;
    }

    expect(
      thrown,
      `Firing an event type that is not in the registry must throw — it is a programmer error, not a channel failure — never resolve to a DispatchResult. dispatch() returned ${JSON.stringify(
        returned,
      )} instead of throwing. The registry lookup must throw before the per-recipient loop.`,
    ).toBeDefined();

    const code = (thrown as { code?: unknown })?.code;
    expect(
      code,
      `An unknown event type must surface as a NotificationError with code 'REGISTRY_MISS' (a distinguishable programmer error), not a generic Error. Got a thrown value with code ${JSON.stringify(
        code,
      )} and message ${JSON.stringify(
        (thrown as { message?: unknown })?.message,
      )}. Throw new NotificationError('REGISTRY_MISS', event.type) on the registry miss.`,
    ).toBe('REGISTRY_MISS');
  });
});

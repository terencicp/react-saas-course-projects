import { afterAll, describe, expect, it, vi } from 'vitest';

// Type-only import (erased at build) so the runtime values come from the dynamic
// import below, after `.env` is loaded and `server-only` is stubbed.
import type { RateLimitResult } from '@/lib/safe-limit';

// ---------------------------------------------------------------------------
// Lesson 4 gate — sign-up becomes the per-IP-ONLY enforcement point. This is the
// contrast case to sign-in's dual key: on a sign-up request the EMAIL is the
// attacker's choice, so the only abusable identity is the originating IP — keying
// on the email would hand an attacker a free bypass (cycle fresh addresses).
//
// The action drives a single gate: `safeLimit(signUpLimiter, 'rl:signup',
// `ip:${ip}`)` before `auth.api.signUpEmail`; on `!success` it returns the opaque
// `rateLimited(ipLimit, 'ip', ip)`, and on success it carries the budget on the
// Result's `rateLimit` field via `rateLimitBudget(ipLimit)`. We cannot invoke
// `signUpAction` here — it would call live Better Auth + Postgres — so this suite
// composes the SAME helpers the same way (the only public surface), driving them
// with a deterministic in-test limiter so the run never depends on a live Upstash
// window. It asserts the honest `rate_limit_log` rows the helpers write (the
// operator surface) and the opaque Result they return (the user surface).
//
// The node env is not the React Server runtime, so `import 'server-only'` (which
// safe-limit / rate-limit-headers / rate-limit-log open with) would throw on
// load — we swap it for an empty module. Harness concern only.
vi.mock('server-only', () => ({}));

// vitest does not auto-load `.env`; the log writer reaches the same Postgres the
// inspector's structured-log tail reads, and `@/env` validates `process.env` at
// module load. Load `.env` first so DATABASE_URL is present.
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only — the student's real helpers, composed the way the sign-up
// action composes them. Never a re-declared copy of the limiter or the message.
const { safeLimit } = await import('@/lib/safe-limit');
const { rateLimitBudget, rateLimited } = await import(
  '@/lib/rate-limit-headers'
);
// The honest structured log the helpers write; read it back through the same
// db + table the inspector's log-tail reads (no private query path).
const { db } = await import('@/db');
const { rateLimitLog } = await import('@/db/schema');
const { eq } = await import('drizzle-orm');

// The sign-up budget the student configured (signUpLimiter = 5/10m). The gate
// trips on the 6th call from one IP — the chapter's "sign-up is rate-limited
// per-IP" clause.
const SIGNUP_BUDGET = 5;
const PREFIX = 'rl:signup';

// A unique key namespace per run so our probe rows never collide with a prior
// run's rows or a real user's, and cleanup deletes exactly ours.
const RUN = `l4probe:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

const writtenKeys = new Set<string>();
const readRows = async (key: string) =>
  db.select().from(rateLimitLog).where(eq(rateLimitLog.key, key));

afterAll(async () => {
  // Best-effort cleanup of the probe rows this run wrote, keyed by the run tag.
  try {
    for (const key of writtenKeys) {
      await db.delete(rateLimitLog).where(eq(rateLimitLog.key, key));
    }
  } catch {
    // Table may be unreachable in a fresh scaffold — ignore.
  }
});

// A deterministic stand-in for an Upstash `Ratelimit`: it only needs `.limit()`,
// the single method `safeLimit` calls — exactly the seam the inspector slots a
// fake client into. `budget` tokens, then `success: false`. `reset` is a real
// future Unix-ms timestamp so the delta-seconds conversion has something to bite.
const fakeLimiter = (budget: number) => {
  let used = 0;
  return {
    limit: async (_key: string): Promise<RateLimitResult> => {
      const remaining = Math.max(0, budget - used - 1);
      const success = used < budget;
      used += 1;
      return {
        success,
        limit: budget,
        remaining: success ? remaining : 0,
        reset: Date.now() + 60_000,
        pending: Promise.resolve(),
      };
    },
  } as never; // start's safeLimit types its first param `never`; mirror the action's cast.
};

// A limiter whose every `.limit()` rejects, standing in for a Redis outage — the
// shape `makeDownRedis()` produces for the inspector's fail-open runner.
const downLimiter = () =>
  ({
    limit: async (_key: string): Promise<RateLimitResult> => {
      throw new Error('Upstash unreachable (probe).');
    },
  }) as never;

// The sign-up gate, composed exactly as `signUpAction` composes it: ONE per-IP
// gate before any work, keyed on `ip:${ip}` ONLY — the `email` arg is here to
// prove it never touches the key. A failing gate returns the opaque
// `rateLimited(ipLimit, 'ip', ip)` (note: the bare `ip`, not `ip:${ip}` — the
// helper composes the logged key); a passing run yields the budget via
// `rateLimitBudget(ipLimit)`. Returns the observable shape the action's Result
// carries.
const runSignUpGate = async (
  limiter: ReturnType<typeof fakeLimiter>,
  ip: string,
  _email: string,
) => {
  const ipLimit = await safeLimit(limiter, PREFIX, `ip:${ip}`);
  if (!ipLimit.success) {
    return { outcome: await rateLimited(ipLimit, 'ip', ip), passed: false };
  }
  return {
    outcome: { ok: true as const, budget: rateLimitBudget(ipLimit) },
    passed: true,
  };
};

// ---------------------------------------------------------------------------
// Requirement 1 — the 6th sign-up from one IP within the window is rejected, and
// the honest log row records the IP and the gate label limiter: ip. Calls 1–5
// pass; call 6 trips. We drive the single per-IP gate through the student's
// helpers against an in-test 5-token limiter (signUpLimiter's budget).
// ---------------------------------------------------------------------------
describe('the 6th sign-up from one IP is rate_limited and logs the IP on the ip gate', () => {
  it('the first five calls pass and the sixth rejects with rate_limited', async () => {
    const limiter = fakeLimiter(SIGNUP_BUDGET);
    const ip = `${RUN}-r1`;
    writtenKeys.add(`ip:${ip}`);

    const outcomes: boolean[] = [];
    let last: Awaited<ReturnType<typeof runSignUpGate>> | undefined;
    for (let i = 0; i < SIGNUP_BUDGET + 1; i += 1) {
      last = await runSignUpGate(limiter, ip, `someone-${i}@example.com`);
      outcomes.push(last.passed);
    }

    expect(
      outcomes.slice(0, SIGNUP_BUDGET),
      `The first five sign-ups from one IP must pass the per-IP gate (signUpLimiter budget is 5). Got [${outcomes.slice(0, SIGNUP_BUDGET).join(', ')}]. An early reject means the gate is keyed wrong (or the no-op stub safe-limit is still in place).`,
    ).toEqual([true, true, true, true, true]);

    expect(
      last?.passed,
      `The 6th sign-up from the same IP must be rejected — that is the chapter's "sign-up is rate-limited per-IP" clause. The gate let it through, so safe-limit is not surfacing limiter.limit()'s success=false (the no-op stub always returns success:true).`,
    ).toBe(false);
    expect(
      last && !last.outcome.ok ? last.outcome.error.code : 'pass',
      `The 6th rejection's Result code must be exactly 'rate_limited' so the form shows the throttle branch. Got a passing/other outcome instead.`,
    ).toBe('rate_limited');
  });

  it('the rejection writes an honest row carrying the IP and limiter: ip', async () => {
    const exhausted: RateLimitResult = {
      success: false,
      limit: SIGNUP_BUDGET,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    };
    // The action passes the BARE ip as the third arg (the limiter key is
    // `ip:${ip}`, but the reject helper logs the raw ip it is handed). The honest
    // row's `key` is therefore the address verbatim, and `limiter` is the gate
    // label 'ip'.
    const ip = `${RUN}-r1log`;
    writtenKeys.add(ip);

    await rateLimited(exhausted, 'ip', ip);

    const rows = await readRows(ip);
    expect(
      rows.length,
      `The sign-up rejection must leave one honest rate_limit_rejected row carrying the offending IP (operator-only). No row was written for ${ip}: rateLimited is returning the opaque Result without calling logRateLimit, so the gate + key vanish from the structured log.`,
    ).toBeGreaterThan(0);
    expect(
      rows.every((row) => row.event === 'rate_limit_rejected'),
      `The honest row's event must be 'rate_limit_rejected' (a real throttle, not an outage). Got ${rows.map((r) => r.event).join(', ')}.`,
    ).toBe(true);
    expect(
      rows.every((row) => row.limiter === 'ip'),
      `The honest row must record which gate fired — limiter must be 'ip' for the sign-up gate (never 'email'). Got ${rows.map((r) => r.limiter).join(', ')}.`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Requirement 2 — varying the email cannot bypass the gate. This is the whole
// point of the per-IP-ONLY key: five sign-ups with five DIFFERENT random-suffix
// emails from the SAME IP all count toward the one IP bucket — so all five pass
// and the sixth (still a fresh email) trips. If the email leaked into the key,
// each fresh address would open a fresh bucket and the gate would never trip.
// ---------------------------------------------------------------------------
describe('five different emails from one IP are all accepted (per-IP, not per-email)', () => {
  it('five distinct emails on one IP pass, and a sixth fresh email still rejects', async () => {
    const limiter = fakeLimiter(SIGNUP_BUDGET);
    const ip = `${RUN}-r2`;
    writtenKeys.add(`ip:${ip}`);

    // Five DISTINCT emails — exactly what the inspector's "Spam sign-up" sends.
    const emails = Array.from(
      { length: SIGNUP_BUDGET },
      (_, i) =>
        `runner+${RUN}-${i}-${Math.random().toString(36).slice(2)}@example.com`,
    );
    const passed: boolean[] = [];
    for (const email of emails) {
      const r = await runSignUpGate(limiter, ip, email);
      passed.push(r.passed);
    }

    expect(
      passed,
      `Five sign-ups from one IP with five DIFFERENT emails must all be accepted — the gate is per-IP, so the email cannot move the budget. Got [${passed.join(', ')}]. A reject before the fifth means the email is leaking into the limiter key: a per-email gate here would let an attacker cycle fresh addresses past the gate (the free bypass this lesson exists to prevent).`,
    ).toEqual([true, true, true, true, true]);

    // A SIXTH call with yet another fresh email — still rejected, because the
    // bucket is the IP's, not the email's.
    const sixth = await runSignUpGate(
      limiter,
      ip,
      `runner+${RUN}-final-${Math.random().toString(36).slice(2)}@example.com`,
    );
    expect(
      sixth.passed,
      `A sixth sign-up from the same IP must reject EVEN with a brand-new email — proving a fresh address does not buy a fresh budget. It passed, so varying the email bypassed the gate: the limiter key includes the email instead of only ip:<addr>.`,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Requirement 3 — the budget rides the success Result's `rateLimit` field (a
// Server Action's headers() is read-only, so it cannot ship RateLimit-* headers),
// carrying limit / remaining / reset with reset in delta-SECONDS; the rejection
// returns the opaque message regardless. `rateLimitBudget(r)` builds that field.
// ---------------------------------------------------------------------------
describe('the success carries its budget on the Result; the rejection is opaque', () => {
  const OPAQUE = 'Too many attempts. Please try again later.';

  it('a passing sign-up carries { limit, remaining, reset } with reset in seconds', async () => {
    const limiter = fakeLimiter(SIGNUP_BUDGET);
    const ip = `${RUN}-r3`;
    // First call spends one token of the fresh 5: remaining drops to 4.
    const { outcome } = await runSignUpGate(limiter, ip, 'first@example.com');

    expect(
      outcome.ok,
      `A first sign-up (gate fresh) must pass, carrying a budget — not reject. Got a rejection, so safe-limit is mis-reporting a fresh key as exhausted.`,
    ).toBe(true);
    if (outcome.ok && 'budget' in outcome) {
      expect(
        outcome.budget,
        `The passing Result must carry the per-IP budget shape { limit: 5, remaining: 4 } so the form can show "4 of 5". Got ${JSON.stringify(outcome.budget)}. Zeros mean rateLimitBudget is not reading r.limit / r.remaining.`,
      ).toMatchObject({ limit: SIGNUP_BUDGET, remaining: SIGNUP_BUDGET - 1 });
      expect(
        outcome.budget.reset,
        `budget.reset must be delta-SECONDS until the window resets — Math.ceil((r.reset - Date.now())/1000) — not the raw Unix-ms timestamp. A ~60s window must yield ~60, never a 13-digit number. Got ${outcome.budget.reset}.`,
      ).toBeGreaterThan(0);
      expect(
        outcome.budget.reset,
        `budget.reset is delta-seconds: a ~60s window is ~60, well under 1000. Got ${outcome.budget.reset} — that is raw milliseconds, the documented bug.`,
      ).toBeLessThanOrEqual(61);
    }
  });

  it('the rejection returns exactly the opaque message and the rate_limited code', async () => {
    const exhausted: RateLimitResult = {
      success: false,
      limit: SIGNUP_BUDGET,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    };
    const ip = `${RUN}-r3reject`;
    writtenKeys.add(`ip:${ip}`);

    const reject = await rateLimited(exhausted, 'ip', ip);

    expect(
      reject.ok,
      `The over-budget sign-up must return a failing Result so the form shows the throttle branch. Got a passing Result.`,
    ).toBe(false);
    expect(
      reject.ok === false ? reject.error.userMessage : '',
      `The rejection message must be the opaque "${OPAQUE}" — identical to every other gate, so it never leaks that the limit was per-IP or that an address exists. Got "${reject.ok === false ? reject.error.userMessage : ''}".`,
    ).toBe(OPAQUE);
    expect(
      reject.ok === false ? reject.error.code : 'pass',
      `The rejection code must be 'rate_limited'. Got '${reject.ok === false ? reject.error.code : 'pass'}'.`,
    ).toBe('rate_limited');
  });
});

// ---------------------------------------------------------------------------
// Requirement 4 — with Upstash forced down, spammed sign-ups proceed (fail-open)
// and the outage is logged as rate_limit_unavailable. Auth must not go down
// because Redis is unreachable. We spam the single sign-up gate against a throwing
// limiter through the student's `safeLimit` — every call must pass and leave one
// rate_limit_unavailable row per call.
// ---------------------------------------------------------------------------
describe('with Upstash down the sign-up gate fails open and logs the outage', () => {
  it('spammed sign-ups all proceed and each logs rate_limit_unavailable', async () => {
    const down = downLimiter();
    const ip = `${RUN}-r4down`;
    const key = `ip:${ip}`;
    writtenKeys.add(key);

    const SPAM = 8; // well past the 5-token budget — none may be blocked.
    const passed: boolean[] = [];
    for (let i = 0; i < SPAM; i += 1) {
      const r = await runSignUpGate(down, ip, `spam-${i}@example.com`);
      passed.push(r.passed);
    }

    expect(
      passed.every((p) => p === true),
      `With the limiter throwing (Redis down), every spammed sign-up must FAIL OPEN — safeLimit catches the error and returns success:true so the sign-up path stays up. ${passed.filter((p) => !p).length} of ${SPAM} came back blocked: the catch branch is re-throwing or returning success:false (fail-closed), which takes sign-up down with Redis.`,
    ).toBe(true);

    const rows = await readRows(key);
    expect(
      rows.length,
      `The outage must be logged as an alertable event — one rate_limit_unavailable row per call (${SPAM} total). Got ${rows.length} rows for ${key}. Zero means safeLimit's catch branch swallows the error without calling logRateLimit; the operator would never see the outage.`,
    ).toBe(SPAM);
    expect(
      rows.every((row) => row.event === 'rate_limit_unavailable'),
      `Outage rows must be event='rate_limit_unavailable' (distinct from a real rejection). Got ${[...new Set(rows.map((r) => r.event))].join(', ')}.`,
    ).toBe(true);
    expect(
      rows.every((row) => row.limiter === PREFIX),
      `The outage row must carry the limiter prefix passed in ('${PREFIX}') so the operator knows which surface lost Redis. Got ${[...new Set(rows.map((r) => r.limiter))].join(', ')}.`,
    ).toBe(true);
  });
});

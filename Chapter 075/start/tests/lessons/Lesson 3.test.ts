import { afterAll, describe, expect, it, vi } from 'vitest';

// Type-only import (erased at build) so the runtime values come from the dynamic
// import below, after `.env` is loaded and `server-only` is stubbed.
import type { RateLimitResult } from '@/lib/safe-limit';

// ---------------------------------------------------------------------------
// Lesson 3 gate — sign-in becomes the dual-keyed enforcement point. The three
// shared helpers the student fills in are the observable surface: `getClientIp`
// / `normalizeEmail` (lib/keys), `safeLimit` (lib/safe-limit, the fail-open
// knob), and `rateLimitBudget` / `rateLimited` (lib/rate-limit-headers, the
// budget-on-Result rule + the opaque-message reject). The sign-in action wires
// these together exactly once; this suite composes the SAME helpers the same way
// — per-IP gate then per-email gate, gate-before-work — driving them with a
// deterministic in-test limiter so the run never depends on a live Upstash
// window. It asserts the honest `rate_limit_log` rows the helpers write (the
// operator-only surface) and the opaque Result they return (the user surface).
//
// The node env is not the React Server runtime, so `import 'server-only'` (which
// safe-limit / rate-limit-headers / rate-limit-log open with) would throw on
// load — we swap it for an empty module. Harness concern only.
vi.mock('server-only', () => ({}));

// vitest does not auto-load `.env`; the log writer reaches the same Postgres the
// inspector's structured-log tail reads, and `@/env` validates `process.env` at
// module load. Load `.env` first so DATABASE_URL is present.
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only — the student's real helpers, composed the way the sign-in
// action composes them. Never a re-declared copy of the limiter or the message.
const { getClientIp, normalizeEmail } = await import('@/lib/keys');
const { safeLimit } = await import('@/lib/safe-limit');
const { rateLimitBudget, rateLimited } = await import(
  '@/lib/rate-limit-headers'
);
// The honest structured log the helpers write; read it back through the same
// db + table the inspector's log-tail reads (no private query path).
const { db } = await import('@/db');
const { rateLimitLog } = await import('@/db/schema');
const { eq } = await import('drizzle-orm');

// A unique key namespace per run so our probe rows never collide with a prior
// run's rows or a real user's, and cleanup deletes exactly ours.
const RUN = `l3probe:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

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

// Track the honest keys we expect to have been logged so afterAll can clean up
// and the assertions can read the exact rows back.
const writtenKeys = new Set<string>();
const readRows = async (key: string) =>
  db.select().from(rateLimitLog).where(eq(rateLimitLog.key, key));

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
  } as never; // start's safeLimit types its first param `never`; mirror runGate's cast.
};

// A limiter whose every `.limit()` rejects, standing in for a Redis outage — the
// shape `makeDownRedis()` produces for the inspector's fail-open runner.
const downLimiter = () =>
  ({
    limit: async (_key: string): Promise<RateLimitResult> => {
      throw new Error('Upstash unreachable (probe).');
    },
  }) as never;

// The dual gate, composed exactly as the sign-in action composes it: per-IP gate
// first (cheaper), then per-email gate, both before any credential work; the
// first failing gate returns the opaque `rateLimited(...)`, a passing run yields
// the budget via `rateLimitBudget(ipLimit)`. Returns the same observable shape
// the action's Result carries.
const runDualGate = async (
  limiter: ReturnType<typeof fakeLimiter>,
  ipKey: string,
  emailKey: string,
) => {
  const ipLimit = await safeLimit(limiter, 'rl:signin', ipKey);
  if (!ipLimit.success) {
    return { outcome: await rateLimited(ipLimit, 'ip', ipKey), gate: 'ip' };
  }
  const emailLimit = await safeLimit(limiter, 'rl:signin', emailKey);
  if (!emailLimit.success) {
    return {
      outcome: await rateLimited(emailLimit, 'email', emailKey),
      gate: 'email',
    };
  }
  return {
    outcome: { ok: true as const, budget: rateLimitBudget(ipLimit) },
    gate: 'pass' as const,
  };
};

// ---------------------------------------------------------------------------
// Requirement 1 — the 11th rapid attempt from one IP is rejected; calls 1–10
// pass the gate (and would reach the credential check, the `unauthorized`
// outcome), with the per-IP budget counting 9 → 0. We drive the per-IP gate
// through the student's `safeLimit` against an in-test 10-token limiter: the
// observable is whether the gate flips to `rate_limited` on call 11 and what
// `remaining` it surfaces on calls 1–10.
// ---------------------------------------------------------------------------
describe('the 11th sign-in from one IP is rate_limited; 1–10 pass with remaining 9→0', () => {
  it('first ten calls pass the gate with remaining counting 9 down to 0', async () => {
    const limiter = fakeLimiter(10);
    const ipKey = `ip:${RUN}:r1`;
    const seen: number[] = [];

    for (let i = 0; i < 10; i += 1) {
      const r = await safeLimit(limiter, 'rl:signin', ipKey);
      expect(
        r.success,
        `Call ${i + 1} of 10 must pass the per-IP gate (budget is 10). It returned success=${r.success}. The stub safe-limit ignores the limiter and always passes; the real one must await limiter.limit(key) and surface its success.`,
      ).toBe(true);
      seen.push(r.remaining);
    }

    expect(
      seen,
      `Across the first ten passing calls the per-IP remaining must count 9 → 0 (the "signin → ip → 9..0" panel rows). Got [${seen.join(', ')}]. All-zero means safe-limit is the no-op stub returning a fixed { remaining: 0 } instead of passing through limiter.limit(key)'s result.`,
    ).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  });

  it('the 11th call trips the gate and returns rate_limited', async () => {
    const limiter = fakeLimiter(10);
    const ipKey = `ip:${RUN}:r1b`;
    writtenKeys.add(ipKey);

    let last: Awaited<ReturnType<typeof runDualGate>> | undefined;
    for (let i = 0; i < 11; i += 1) {
      last = await runDualGate(limiter, ipKey, `email:${RUN}:r1b`);
    }

    expect(
      last?.outcome.ok,
      `After 11 rapid calls the gate must reject — the 11th returns a rate_limited Result, not a pass. The gate never tripped, so safe-limit is not surfacing limiter.limit()'s success=false (the no-op stub always returns success:true).`,
    ).toBe(false);
    expect(
      last && !last.outcome.ok ? last.outcome.error.code : 'pass',
      `The 11th rejection's Result code must be exactly 'rate_limited' so the form shows the throttle branch. Got a passing/other outcome instead.`,
    ).toBe('rate_limited');
  });
});

// ---------------------------------------------------------------------------
// Requirement 2 — credential stuffing spread across distinct IPs is caught on
// the per-EMAIL gate, not the per-IP gate. We compose the dual gate 11 times
// with a FRESH ip: key each iteration (every per-IP bucket stays full) but the
// SAME email: key (it counts down). The 11th must reject on the email gate, and
// the honest log row must be keyed on the email — proving the cross-IP catch
// through the same helpers the action uses.
// ---------------------------------------------------------------------------
describe('the same email across distinct IPs trips the per-email gate', () => {
  it('rejects on the email gate at the 11th cross-IP attempt and logs key: email:<addr>', async () => {
    // One shared email limiter; a fresh per-IP limiter each iteration so no IP
    // bucket ever fills (mirrors spoof-ip-runner's synthetic-IP-per-call).
    const emailLimiter = fakeLimiter(10);
    const emailKey = `email:${RUN}:stuffing`;
    writtenKeys.add(emailKey);

    let trippedGate: string | undefined;
    let trippedCode: string | undefined;
    for (let i = 0; i < 11; i += 1) {
      const freshIpKey = `ip:${RUN}:fresh-${i}`;
      const freshIpLimiter = fakeLimiter(10);

      const ipLimit = await safeLimit(freshIpLimiter, 'rl:signin', freshIpKey);
      expect(
        ipLimit.success,
        `Each cross-IP attempt uses a never-seen IP, so the per-IP gate must always pass — only the shared email gate may trip. Attempt ${i + 1} failed the per-IP gate (success=${ipLimit.success}). A per-IP reject here means the keys are colliding.`,
      ).toBe(true);

      const emailLimit = await safeLimit(emailLimiter, 'rl:signin', emailKey);
      if (!emailLimit.success) {
        const rejected = await rateLimited(emailLimit, 'email', emailKey);
        trippedGate = 'email';
        trippedCode = rejected.ok ? 'pass' : rejected.error.code;
        break;
      }
    }

    expect(
      trippedGate,
      `The cross-IP burst must be stopped by the per-email gate — per-IP alone misses credential stuffing spread across hosts. No gate tripped after 11 attempts, so safe-limit is not surfacing the shared email limiter's exhaustion.`,
    ).toBe('email');
    expect(trippedCode, `The cross-IP rejection must be 'rate_limited'.`).toBe(
      'rate_limited',
    );

    const rows = await readRows(emailKey);
    expect(
      rows.length,
      `The per-email rejection must leave an honest rate_limit_rejected row keyed on email:<addr> (operator-only). No row was written for ${emailKey}: the rateLimited helper is returning the opaque Result without calling logRateLimit — the gate + key would vanish from the structured log.`,
    ).toBeGreaterThan(0);
    expect(
      rows.every((row) => row.event === 'rate_limit_rejected'),
      `The honest row's event must be 'rate_limit_rejected' (not 'rate_limit_unavailable'). Got ${rows.map((r) => r.event).join(', ')}.`,
    ).toBe(true);
    expect(
      rows.every((row) => row.limiter === 'email'),
      `The honest row must record which gate fired — limiter must be 'email' for the cross-IP catch. Got ${rows.map((r) => r.limiter).join(', ')}. The action passes 'email' as the gate arg; rateLimited must log it verbatim.`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Requirement 3 — the budget travels INSIDE the success Result's `rateLimit`
// field (a Server Action's headers() is read-only), and its `reset` is
// delta-seconds, not a raw ms timestamp. `rateLimitBudget(r)` is the function
// that builds that field; we assert its shape and the seconds conversion.
// ---------------------------------------------------------------------------
describe('the budget rides the Result with limit/remaining/reset in delta-seconds', () => {
  it('rateLimitBudget surfaces limit and remaining and converts reset to seconds', () => {
    const resetMs = Date.now() + 60_000; // ~60s out
    const budget = rateLimitBudget({
      success: true,
      limit: 10,
      remaining: 7,
      reset: resetMs,
      pending: Promise.resolve(),
    });

    expect(
      budget.limit,
      `The budget must carry the limiter's own limit so the form can show "n of 10". Got ${budget.limit} (expected 10). The zero stub means rateLimitBudget is not reading r.limit.`,
    ).toBe(10);
    expect(
      budget.remaining,
      `The budget must carry the live remaining. Got ${budget.remaining} (expected 7).`,
    ).toBe(7);
    expect(
      budget.reset,
      `reset must be delta-SECONDS until the window resets — Math.ceil((r.reset - Date.now())/1000) — not the raw Unix-ms timestamp (${resetMs}). A ~60s window must yield ~60, never a 13-digit number. Got ${budget.reset}.`,
    ).toBeGreaterThan(0);
    expect(
      budget.reset,
      `reset is delta-seconds: a ~60s window is ~60, well under 1000. Got ${budget.reset} — that is raw milliseconds, the documented bug.`,
    ).toBeLessThanOrEqual(61);
  });

  it('on a passing dual-gate run the carried budget reflects the per-IP gate', async () => {
    const limiter = fakeLimiter(10);
    // First call spends one token: remaining drops to 9.
    const { outcome } = await runDualGate(
      limiter,
      `ip:${RUN}:r3`,
      `email:${RUN}:r3`,
    );

    expect(
      outcome.ok,
      `A first sign-in (gates fresh) must pass, carrying a budget — not reject. Got a rejection, so safe-limit is mis-reporting a fresh key as exhausted.`,
    ).toBe(true);
    if (outcome.ok && 'budget' in outcome) {
      expect(
        outcome.budget,
        `The passing Result must carry the per-IP budget shape { limit, remaining, reset }. Got ${JSON.stringify(outcome.budget)}.`,
      ).toMatchObject({ limit: 10, remaining: 9 });
    }
  });
});

// ---------------------------------------------------------------------------
// Requirement 4 — every rejection returns the SAME opaque message regardless of
// which gate fired (returning "IP-limited" vs "email-limited" leaks which gate
// tripped and confirms an address exists); the honest gate + key land only in
// the log row. We reject through both gates and compare the user-facing Result,
// then read the two honest rows back.
// ---------------------------------------------------------------------------
describe('every rejection is identically opaque; the gate+key surface only in the log', () => {
  const OPAQUE = 'Too many attempts. Please try again later.';

  it('an ip-gate reject and an email-gate reject return the identical opaque Result', async () => {
    const exhausted: RateLimitResult = {
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    };
    const ipKey = `ip:${RUN}:r4`;
    const emailKey = `email:${RUN}:r4`;
    writtenKeys.add(ipKey);
    writtenKeys.add(emailKey);

    const ipReject = await rateLimited(exhausted, 'ip', ipKey);
    const emailReject = await rateLimited(exhausted, 'email', emailKey);

    expect(
      ipReject.ok === false &&
        emailReject.ok === false &&
        ipReject.error.userMessage === emailReject.error.userMessage,
      `The two rejections must be byte-identical to the user — a different message per gate leaks which gate fired and confirms an address exists. ip="${ipReject.ok === false ? ipReject.error.userMessage : ''}" email="${emailReject.ok === false ? emailReject.error.userMessage : ''}".`,
    ).toBe(true);
    expect(
      ipReject.ok === false ? ipReject.error.userMessage : '',
      `The opaque message must read exactly "${OPAQUE}". Got "${ipReject.ok === false ? ipReject.error.userMessage : ''}".`,
    ).toBe(OPAQUE);
    expect(
      ipReject.ok === false ? ipReject.error.code : 'pass',
      `The rejection code must be 'rate_limited'.`,
    ).toBe('rate_limited');
  });

  it('the honest rows distinguish the gates the opaque message hides', async () => {
    const exhausted: RateLimitResult = {
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    };
    const ipKey = `ip:${RUN}:r4log`;
    const emailKey = `email:${RUN}:r4log`;
    writtenKeys.add(ipKey);
    writtenKeys.add(emailKey);

    await rateLimited(exhausted, 'ip', ipKey);
    await rateLimited(exhausted, 'email', emailKey);

    const ipRows = await readRows(ipKey);
    const emailRows = await readRows(emailKey);

    expect(
      ipRows.length > 0 && emailRows.length > 0,
      `Each rejection must write one honest rate_limit_rejected row carrying the real gate + key (the operator surface). ip rows=${ipRows.length}, email rows=${emailRows.length}. A zero means rateLimited returns the opaque Result without calling logRateLimit — the honest signal never reaches the structured log.`,
    ).toBe(true);
    expect(
      ipRows[0]?.limiter,
      `The ip-gate row must record limiter='ip' so the operator can see which gate fired even though the user message hides it. Got '${ipRows[0]?.limiter}'.`,
    ).toBe('ip');
    expect(
      emailRows[0]?.limiter,
      `The email-gate row must record limiter='email'. Got '${emailRows[0]?.limiter}'.`,
    ).toBe('email');
  });
});

// ---------------------------------------------------------------------------
// Requirement 5 — the limiter fails OPEN on a Redis outage: auth must not go
// down because Redis is unreachable. Spamming 15 calls against a throwing
// limiter must let all 15 proceed (success:true) and leave 15
// rate_limit_unavailable rows (the alertable event). This is the one place the
// fail-open policy lives — `safeLimit`'s catch branch.
// ---------------------------------------------------------------------------
describe('the limiter fails open on a Redis outage and logs the outage', () => {
  it('15 spammed calls against a down limiter all proceed and log rate_limit_unavailable', async () => {
    const down = downLimiter();
    const key = `ip:${RUN}:r5down`;
    writtenKeys.add(key);

    const results: boolean[] = [];
    for (let i = 0; i < 15; i += 1) {
      const r = await safeLimit(down, 'rl:signin', key);
      results.push(r.success);
    }

    expect(
      results.every((s) => s === true),
      `With the limiter throwing (Redis down), every call must FAIL OPEN — safeLimit catches the error and returns success:true so the auth path stays up. ${results.filter((s) => !s).length} of 15 came back blocked: the catch branch is re-throwing or returning success:false (fail-closed), which takes auth down with Redis.`,
    ).toBe(true);

    const rows = await readRows(key);
    expect(
      rows.length,
      `The outage must be logged as an alertable event — one rate_limit_unavailable row per failed limiter call (15 total). Got ${rows.length} rows for ${key}. Zero means the catch branch swallows the error without calling logRateLimit; the operator would never see the outage.`,
    ).toBe(15);
    expect(
      rows.every((row) => row.event === 'rate_limit_unavailable'),
      `Outage rows must be event='rate_limit_unavailable' (distinct from a real rejection). Got ${[...new Set(rows.map((r) => r.event))].join(', ')}.`,
    ).toBe(true);
    expect(
      rows.every((row) => row.limiter === 'rl:signin'),
      `The outage row must carry the limiter prefix passed in ('rl:signin') so the operator knows which surface lost Redis. Got ${[...new Set(rows.map((r) => r.limiter))].join(', ')}. safeLimit takes prefix as a param because Ratelimit.prefix is protected — log that param verbatim.`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Requirement 6 — once the window resets (a fresh key / cleared counters), the
// next sign-in passes the gate again with remaining back to 9. We model the
// reset as a fresh limiter+key (the same observable resetUsedTokens produces):
// the gate must let the call through at full-budget-minus-one, not stay locked.
// ---------------------------------------------------------------------------
describe('after the window resets the next sign-in passes again with remaining 9', () => {
  it('a fresh key reads as a pass with remaining 9 after a prior exhaustion', async () => {
    // Exhaust one key.
    const stale = fakeLimiter(10);
    const staleKey = `ip:${RUN}:r6stale`;
    for (let i = 0; i < 11; i += 1) {
      await safeLimit(stale, 'rl:signin', staleKey);
    }
    const blocked = await safeLimit(stale, 'rl:signin', staleKey);
    expect(
      blocked.success,
      `Sanity: the exhausted key must still be blocked before the reset. It passed — the fixture is wrong, not the student code.`,
    ).toBe(false);

    // The window resets → a fresh limiter/key (what resetUsedTokens yields).
    const fresh = fakeLimiter(10);
    const freshKey = `ip:${RUN}:r6fresh`;
    const after = await safeLimit(fresh, 'rl:signin', freshKey);

    expect(
      after.success,
      `After the window resets the next sign-in must pass the gate again — not stay locked. It came back blocked, so safe-limit is not surfacing the limiter's post-reset success.`,
    ).toBe(true);
    expect(
      after.remaining,
      `The post-reset pass must read remaining=9 (one token spent of the fresh 10) — the "signin → ip → 9/10" panel row after a reset. Got ${after.remaining}. Zero is the no-op stub's fixed value, not a passthrough of limiter.limit().`,
    ).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// Helper sanity — `getClientIp` reads the forwarded chain and `normalizeEmail`
// folds case, so the limiter key and the DB lookup count one identifier. These
// underpin every gate above (the key the action feeds safeLimit).
// ---------------------------------------------------------------------------
describe('the key helpers resolve one identifier for limiter and lookup', () => {
  it('getClientIp takes the first x-forwarded-for entry, then x-real-ip, then unknown', () => {
    const forwarded = new Headers({
      'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178',
    });
    expect(
      getClientIp(forwarded),
      `getClientIp must take the FIRST x-forwarded-for entry (the real client on Vercel), trimmed. Got '${getClientIp(forwarded)}'. The 'unknown' stub never reads the header — without a real IP every request shares one bucket.`,
    ).toBe('203.0.113.7');

    const realIp = new Headers({ 'x-real-ip': '198.51.100.9' });
    expect(
      getClientIp(realIp),
      `With no x-forwarded-for, getClientIp must fall back to x-real-ip. Got '${getClientIp(realIp)}'.`,
    ).toBe('198.51.100.9');

    expect(
      getClientIp(new Headers()),
      `With neither header present, getClientIp must return 'unknown'.`,
    ).toBe('unknown');
  });

  it('normalizeEmail trims and lowercases without stripping +-aliases', () => {
    expect(
      normalizeEmail('  Alice@Example.COM '),
      `normalizeEmail must trim + lowercase so the limiter key and the DB lookup count one identifier. Got '${normalizeEmail('  Alice@Example.COM ')}'.`,
    ).toBe('alice@example.com');
    expect(
      normalizeEmail('alice+tag@example.com'),
      `normalizeEmail must NOT strip the +-alias — an alias and its base stay distinct keys on purpose. Got '${normalizeEmail('alice+tag@example.com')}'.`,
    ).toBe('alice+tag@example.com');
  });
});

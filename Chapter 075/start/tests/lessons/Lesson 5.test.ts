import { createElement } from 'react';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Type-only import (erased at build) so the runtime values come from the dynamic
// import below, after `.env` is loaded and `server-only` is stubbed.
import type { RateLimitResult } from '@/lib/safe-limit';

// ---------------------------------------------------------------------------
// Lesson 5 gate — the password-reset action becomes the project's last and
// tightest enforcement point. Reset is the SECOND dual-keyed endpoint, but its
// per-email gate exists for a different reason than sign-in's: every accepted
// reset sends real mail, so the cost of abuse lands on a THIRD PARTY (the
// victim's inbox + the app's Resend budget). The per-IP gate stops one noisy
// host; the per-email gate protects the targeted address ACROSS hosts —
// surviving an IP switch is its load-bearing property.
//
// The student fills in `src/app/(auth)/reset/actions.ts` only. Its valid path
// reads `headers()` (request-scoped) and calls `auth.api.requestPasswordReset`
// (live Better Auth) — neither exists in the node test runtime, exactly as the
// inspector documents (a Server Action can't inject a synthetic x-forwarded-for
// into `getClientIp(await headers())`). So this suite asserts two observable
// surfaces that DON'T need a request scope:
//
//   • The action's own parse early-return — directly callable. In start the stub
//     returns `internal` for everything; the wired action returns the canonical
//     `validation` Result. (Requirement 5, success/failure shape.)
//   • The dual gate composed from the SAME shared helpers the reset action wires
//     — `safeLimit` on a deterministic in-test limiter (budget 3, reset's window),
//     `rateLimited`, and the real `sendEmail` mock — per-IP gate then per-email
//     gate, gate-before-work, mirroring the action exactly. This is the same
//     composition the inspector's `spamReset` / `distinctIpReset` runners use, and
//     it never depends on a live Upstash window (`.env` ships placeholder Upstash
//     creds) or a live request scope.
//
// In start, `safeLimit` is the no-op stub (always `success: true`), so the
// composed gate never trips — every gate-trip assertion fails informatively. In
// the solution it's real, so the in-test limiter's exhaustion surfaces.
//
// The node env is not the React Server runtime, so `import 'server-only'` (which
// safe-limit / rate-limit-headers / rate-limit-log / email open with) would throw
// on load — we swap it for an empty module. Harness concern only.
vi.mock('server-only', () => ({}));

// vitest does not auto-load `.env`; the log writer + email mock reach the same
// Postgres the inspector's structured-log tail reads, and `@/env` validates
// `process.env` at module load. Load `.env` first so DATABASE_URL is present.
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface only — the student's real helpers + action, composed the way the
// reset action composes them. Never a re-declared copy of the limiter or message.
const { resetAction } = await import('@/app/(auth)/reset/actions');
const { safeLimit } = await import('@/lib/safe-limit');
const { rateLimited } = await import('@/lib/rate-limit-headers');
const { sendEmail, getMockEmailSentCount } = await import('@/lib/email');
// The honest structured log the helpers write; read it back through the same db +
// table the inspector's log-tail reads (no private query path).
const { db } = await import('@/db');
const { rateLimitLog } = await import('@/db/schema');
const { eq } = await import('drizzle-orm');

// The reset target the inspector's "Spam reset" runner uses — a fixed victim
// address, so the per-email gate is what we exercise across rotating IPs.
const VICTIM = 'eve@example.com';
const RESET_BUDGET = 3; // reset's tightest-in-the-project window: 3 / 15m.
const OPAQUE = 'Too many attempts. Please try again later.';

// A unique key namespace per run so our probe rows never collide with a prior
// run's rows or a real user's, and cleanup deletes exactly ours.
const RUN = `l5probe:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
const writtenKeys = new Set<string>();

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

const readRows = async (key: string) =>
  db.select().from(rateLimitLog).where(eq(rateLimitLog.key, key));

// A deterministic stand-in for an Upstash `Ratelimit`: it only needs `.limit()`,
// the single method `safeLimit` calls — exactly the seam the inspector slots a
// fake client into, so the run never depends on a live Upstash window. `budget`
// tokens, then `success: false`. `reset` is a real future Unix-ms timestamp so the
// delta-seconds conversion the helpers do has something to bite.
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

// The reset dual gate, composed EXACTLY as `reset/actions.ts` composes it: per-IP
// gate first (cheaper), then per-email gate, both through `safeLimit` on the reset
// prefix, both BEFORE the (mocked) send. The first failing gate returns the opaque
// `rateLimited(...)`; a passing run fires one mocked reset mail and returns the
// `ok({ sent: true })` marker (reset has no redirect — the form confirms in place).
// `ipLimiter` is supplied per call so a campaign can rotate to a fresh per-IP
// bucket while the shared `emailLimiter` keeps counting down — the cross-host case.
const runResetGate = async (
  ipLimiter: ReturnType<typeof fakeLimiter>,
  emailLimiter: ReturnType<typeof fakeLimiter>,
  ipKey: string,
  emailKey: string,
) => {
  const ipLimit = await safeLimit(ipLimiter, 'rl:reset', `ip:${ipKey}`);
  if (!ipLimit.success) {
    return {
      outcome: await rateLimited(ipLimit, 'ip', ipKey),
      gate: 'ip' as const,
    };
  }
  const emailLimit = await safeLimit(
    emailLimiter,
    'rl:reset',
    `email:${emailKey}`,
  );
  if (!emailLimit.success) {
    return {
      outcome: await rateLimited(emailLimit, 'email', emailKey),
      gate: 'email' as const,
    };
  }
  // Both gates passed → fire the real (mocked) reset mail, mirroring the
  // sendResetPassword callback the action's requestPasswordReset triggers.
  process.env.INSPECTOR_MOCK_EMAIL = '1';
  await sendEmail({
    to: emailKey,
    subject: 'Reset your password',
    react: createElement('p', null, 'Reset your password'),
    idempotencyKey: `reset:${emailKey}:${ipKey}`,
  });
  return { outcome: { ok: true as const, sent: true }, gate: 'pass' as const };
};

// ---------------------------------------------------------------------------
// Requirement 1 — four resets against eve@example.com across DISTINCT IPs return
// rate_limited on the 4th, keyed on the per-EMAIL gate (limiter: 'reset', key:
// email:eve@example.com). Every per-IP bucket stays fresh (a fresh limiter + key
// each call, mirroring spamReset's synthetic-IP-per-call), so the only gate that
// can trip is the shared per-email gate — the load-bearing one for a cross-host
// campaign. We drive the reset dual gate through the student's `safeLimit` against
// in-test limiters at reset's budget (3); the observable is that calls 1–3 pass
// and call 4 trips on the email gate, leaving an honest row keyed on the email.
// ---------------------------------------------------------------------------
describe('four resets against one email across distinct IPs trip the per-email gate on the 4th', () => {
  it('calls 1–3 pass; the 4th cross-IP reset rejects on the email gate keyed email:eve@example.com', async () => {
    // One shared email limiter (the victim's address); a fresh per-IP limiter +
    // key each call so no per-IP bucket ever fills — only the email gate may trip.
    const emailLimiter = fakeLimiter(RESET_BUDGET);
    writtenKeys.add(VICTIM);

    const gates: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const freshIp = `${RUN}:r1-ip-${i}`;
      const { gate } = await runResetGate(
        fakeLimiter(RESET_BUDGET),
        emailLimiter,
        freshIp,
        VICTIM,
      );
      gates.push(gate);
    }

    expect(
      gates.slice(0, 3),
      `The first three cross-IP resets must each pass both gates (budget is 3). Got [${gates.slice(0, 3).join(', ')}]. The no-op stub safe-limit ignores the limiter and always passes, so it can't yet reject — but it must also not reject these three: a non-'pass' here means the keys are colliding.`,
    ).toEqual(['pass', 'pass', 'pass']);

    expect(
      gates[3],
      `The 4th reset must be stopped by the per-EMAIL gate, not the per-IP gate — every IP bucket stayed fresh, so per-IP alone would miss this cross-host campaign. Got gate='${gates[3]}'. The no-op stub safe-limit always returns success:true, so the shared email limiter's exhaustion never surfaces; the wired action must await safeLimit(resetLimiter, 'rl:reset', 'email:'+email) and reject on !success.`,
    ).toBe('email');

    // The honest row records which gate fired and on which key — the operator
    // surface the opaque user message hides (limiter: 'email', key: the address).
    const rows = await readRows(VICTIM);
    expect(
      rows.length,
      `The per-email rejection must leave an honest rate_limit_rejected row keyed on email:eve@example.com (operator-only). No row was written for '${VICTIM}': either the email gate never tripped (no-op safe-limit) or rateLimited returned the opaque Result without logging the gate + key.`,
    ).toBeGreaterThan(0);
    expect(
      rows.every((row) => row.limiter === 'email'),
      `The honest row must record the gate that fired — limiter must be 'email' for the cross-IP catch (the inspector reads this as limiter:'reset', key:'email:eve@example.com'). Got [${rows.map((r) => r.limiter).join(', ')}]. The action passes 'email' as the gate arg; rateLimited logs it verbatim.`,
    ).toBe(true);
    expect(
      rows.every((row) => row.event === 'rate_limit_rejected'),
      `The honest row's event must be 'rate_limit_rejected' (a real reject), not 'rate_limit_unavailable' (a Redis outage). Got [${[...new Set(rows.map((r) => r.event))].join(', ')}].`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Requirement 2 — after the email budget is spent, ONE MORE IP switch is still
// rejected on the per-email gate. This is the gate's load-bearing property: a
// campaign that rotates to yet another host can't get through, because the gate
// is keyed on the victim's address, not the requester's IP. The fresh per-IP
// bucket passes; the exhausted email bucket still rejects (the inspector's
// "Distinct IPs (reset)" runner).
// ---------------------------------------------------------------------------
describe('the per-email reset gate survives one more IP switch', () => {
  it('a further reset from a never-seen IP is still rate_limited on the per-email gate', async () => {
    // Exhaust the shared email limiter (3 passes), then switch to a brand-new IP.
    const emailLimiter = fakeLimiter(RESET_BUDGET);
    writtenKeys.add(VICTIM);
    for (let i = 0; i < RESET_BUDGET; i += 1) {
      await runResetGate(
        fakeLimiter(RESET_BUDGET),
        emailLimiter,
        `${RUN}:r2-warm-${i}`,
        VICTIM,
      );
    }

    // The IP switch: a fresh per-IP bucket (passes) against the spent email bucket.
    const switched = await runResetGate(
      fakeLimiter(RESET_BUDGET),
      emailLimiter,
      `${RUN}:r2-switched-ip`,
      VICTIM,
    );

    expect(
      switched.gate,
      `Switching to a never-seen IP must NOT let the reset through — the per-email gate is keyed on the victim's address and survives the IP rotation (the whole point of dual-keying reset). Got gate='${switched.gate}'. If this is 'pass', the per-email budget is being read as fresh on the IP switch: the shared email key must keep counting down across IPs.`,
    ).toBe('email');
    expect(
      switched.outcome.ok,
      `The IP-switched reset must reject (ok:false) on the per-email gate, not succeed. The no-op stub safe-limit always passes, so the exhausted email budget never blocks the switch.`,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Requirement 3 — a burst from ONE IP against distinct addresses is rejected on
// the per-IP gate once the per-IP budget is spent. Per-IP is checked first, so a
// same-IP burst trips THERE before the per-email gate is even consulted — the
// mirror image of requirement 1, and why demonstrating the per-email gate needs
// distinct IPs. We hold the IP limiter shared and vary the email each call.
// ---------------------------------------------------------------------------
describe('a same-IP burst against distinct addresses trips the per-IP gate', () => {
  it('the 4th reset from one IP rejects on the per-IP gate once its budget is spent', async () => {
    const ipLimiter = fakeLimiter(RESET_BUDGET);
    const sharedIp = `${RUN}:r3-shared-ip`;
    writtenKeys.add(sharedIp);

    const gates: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      // A fresh address each call → every per-email bucket stays full; only the
      // shared per-IP bucket counts down.
      const freshEmail = `${RUN}-r3-${i}@example.com`;
      const { gate } = await runResetGate(
        ipLimiter,
        fakeLimiter(RESET_BUDGET),
        sharedIp,
        freshEmail,
      );
      gates.push(gate);
    }

    expect(
      gates.slice(0, 3),
      `The first three same-IP resets must pass (per-IP budget is 3). Got [${gates.slice(0, 3).join(', ')}].`,
    ).toEqual(['pass', 'pass', 'pass']);
    expect(
      gates[3],
      `The 4th same-IP reset must be stopped by the per-IP gate — it's checked first, so a same-IP burst trips there before the per-email gate is consulted. Got gate='${gates[3]}'. The no-op stub safe-limit never blocks; the wired action must reject on the per-IP safeLimit's !success.`,
    ).toBe('ip');

    const rows = await readRows(sharedIp);
    expect(
      rows.some((row) => row.limiter === 'ip'),
      `The per-IP rejection must leave an honest row with limiter='ip' on the IP key. Got [${rows.map((r) => r.limiter).join(', ')}].`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Requirement 4 — the mock-email counter rises by exactly the number of
// SUCCESSFUL resets; rate-limited attempts send no mail. Every accepted reset
// fires one real send (mocked here), so a blocked attempt that still sent would
// be exactly the abuse the gate exists to stop — a victim's inbox flooded even
// after the gate "rejected". We run the cross-IP campaign (3 pass, 1 rejected on
// the email gate) and assert the mock counter moved by precisely 3, not 4.
// ---------------------------------------------------------------------------
describe('the mock-email counter rises only by the number of successful resets', () => {
  it('a 3-pass / 1-rejected campaign sends exactly 3 mocked mails, never 4', async () => {
    process.env.INSPECTOR_MOCK_EMAIL = '1';
    const emailLimiter = fakeLimiter(RESET_BUDGET);
    writtenKeys.add(VICTIM);

    const before = getMockEmailSentCount();
    let passed = 0;
    for (let i = 0; i < 4; i += 1) {
      const { gate } = await runResetGate(
        fakeLimiter(RESET_BUDGET),
        emailLimiter,
        `${RUN}:r4-ip-${i}`,
        VICTIM,
      );
      if (gate === 'pass') {
        passed += 1;
      }
    }
    const delta = getMockEmailSentCount() - before;

    expect(
      passed,
      `The campaign must have exactly three passing resets (the 4th trips the per-email gate). Got ${passed} passes — the gate isn't tripping (no-op safe-limit), so all four would 'pass' and send.`,
    ).toBe(3);
    expect(
      delta,
      `getMockEmailSentCount() must rise by exactly the number of SUCCESSFUL resets (3), never by 4. Got +${delta}. A +4 means the rate-limited 4th attempt still sent mail — the send must happen only AFTER both gates pass; gating after the send (or not gating) floods the victim's inbox the gate exists to protect.`,
    ).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Requirement 5 — the success path returns the canonical ok({ sent: true })
// marker (reset has no redirect; the form confirms in place), while a rejection
// returns the opaque rate_limited message with the gate + key surfacing ONLY in
// the honest log row. We assert three things: the action's own parse early-return
// is the canonical validation Result (directly callable — the one part of the
// wired action reachable without a request scope; the start stub returns
// 'internal' instead); a passing gate yields { ok: true, sent: true }; and an ip-
// gate reject and an email-gate reject return the byte-identical opaque message
// while their honest rows record the distinct gates the message hides.
// ---------------------------------------------------------------------------
describe('success returns ok({ sent: true }); rejection is opaque with gate + key only in the log', () => {
  it('the action rejects a malformed email with the canonical validation Result', async () => {
    const fd = new FormData();
    fd.set('email', 'not-an-email');
    const result = await resetAction(null, fd);

    expect(
      result.ok,
      `A malformed email must NOT be accepted. The wired action parses with a strict schema and returns a validation Result; the start stub returns ok or 'internal' for everything.`,
    ).toBe(false);
    expect(
      result.ok === false ? result.error.code : 'ok',
      `A bad email must map to error.code 'validation' so the form highlights the field. Got '${result.ok === false ? result.error.code : 'ok'}'. The start stub returns 'internal' ("Not implemented") for every input — that's the un-wired action.`,
    ).toBe('validation');
  });

  it('a passing reset gate returns the ok({ sent: true }) marker — no redirect', async () => {
    const { outcome } = await runResetGate(
      fakeLimiter(RESET_BUDGET),
      fakeLimiter(RESET_BUDGET),
      `${RUN}:r5-ip`,
      VICTIM,
    );
    expect(
      outcome.ok,
      `A first reset (gates fresh) must pass and return the ok marker — not reject. Got a rejection, so safe-limit is mis-reporting a fresh key as exhausted.`,
    ).toBe(true);
    expect(
      outcome.ok && 'sent' in outcome ? outcome.sent : false,
      `The reset success payload is the marker { sent: true } (the form shows an enumeration-uniform confirmation in place — reset has no redirect). The shape must carry sent:true.`,
    ).toBe(true);
  });

  it('an ip-gate reject and an email-gate reject return the identical opaque message; the gates surface only in the log', async () => {
    const exhausted: RateLimitResult = {
      success: false,
      limit: RESET_BUDGET,
      remaining: 0,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    };
    const ipKey = `${RUN}:r5-ipkey`;
    const emailKey = `${RUN}:r5-emailkey@example.com`;
    writtenKeys.add(ipKey);
    writtenKeys.add(emailKey);

    const ipReject = await rateLimited(exhausted, 'ip', ipKey);
    const emailReject = await rateLimited(exhausted, 'email', emailKey);

    expect(
      ipReject.ok === false &&
        emailReject.ok === false &&
        ipReject.error.userMessage === emailReject.error.userMessage,
      `Both rejections must be byte-identical to the user — a different message per gate would leak which gate fired and confirm an address exists. ip="${ipReject.ok === false ? ipReject.error.userMessage : ''}" email="${emailReject.ok === false ? emailReject.error.userMessage : ''}".`,
    ).toBe(true);
    expect(
      ipReject.ok === false ? ipReject.error.userMessage : '',
      `The opaque reset message must read exactly "${OPAQUE}". Got "${ipReject.ok === false ? ipReject.error.userMessage : ''}".`,
    ).toBe(OPAQUE);
    expect(
      ipReject.ok === false ? ipReject.error.code : 'ok',
      `The rejection code must be 'rate_limited' so the form shows the throttle branch.`,
    ).toBe('rate_limited');

    const ipRows = await readRows(ipKey);
    const emailRows = await readRows(emailKey);
    expect(
      ipRows[0]?.limiter,
      `The ip-gate row must record limiter='ip' (the operator surface the opaque message hides). Got '${ipRows[0]?.limiter}' — zero rows means rateLimited returned the opaque Result without calling logRateLimit.`,
    ).toBe('ip');
    expect(
      emailRows[0]?.limiter,
      `The email-gate row must record limiter='email'. Got '${emailRows[0]?.limiter}'.`,
    ).toBe('email');
  });
});

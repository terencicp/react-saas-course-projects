'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { resetAction } from '@/app/(auth)/reset/actions';
import { signInAction } from '@/app/(auth)/sign-in/actions';
import { signUpAction } from '@/app/(auth)/sign-up/actions';
import {
  type ActiveIdentity,
  clearResponses,
  drainSeenKeys,
  IDENTITY_EMAIL,
  type InspectorResponse,
  inspectorState,
  pushResponse,
  recordSeenKey,
} from '@/app/inspector/inspector-store';
import { db } from '@/db';
import { rateLimitLog } from '@/db/schema';
import { auth } from '@/lib/auth';
import { mapAuthError } from '@/lib/auth/error-mapping';
import { getClientIp } from '@/lib/keys';
import {
  LIMITER_MAX,
  resetLimiter,
  signInLimiter,
  signUpLimiter,
} from '@/lib/rate-limit';
import { rateLimitBudget, rateLimited } from '@/lib/rate-limit-headers';
import { makeDownRedis } from '@/lib/redis-mock';
import { err, ok } from '@/lib/result';
import { safeLimit } from '@/lib/safe-limit';

const OPAQUE = 'Too many attempts. Please try again later.';

// Every inspector mutation refreshes the page so the panels re-read live state.
const refresh = (): void => revalidatePath('/inspector');

// Read the outcome code + budget off a student-action Result and record it in the
// recent-responses log. The student actions return the canonical single-param
// Result<T>; the inspector reads the real code (ok / rate_limited / unauthorized /
// validation / internal) and the budget — never an HTTP status (the budget rides the
// Result; headers live only on /api/limit-demo). On a rejected gate the inspector also
// surfaces the gate `key` (operator-honest instrumentation) while the user-facing
// message stays the opaque 429 body.
const record = (
  endpoint: 'sign-in' | 'sign-up' | 'reset',
  result:
    | Awaited<ReturnType<typeof signInAction>>
    | Awaited<ReturnType<typeof resetAction>>,
  ms: number,
  // On a rejected gate, the operator-honest key. On a non-ok credential failure
  // (unauthorized), an optional budget read off `getRemaining` so the per-IP `remaining`
  // declines row-by-row even though the error Result carries no budget of its own.
  reject?: { key?: string; budget?: InspectorResponse['budget'] },
): void => {
  if (result.ok) {
    const data = result.data as {
      rateLimit?: { limit: number; remaining: number; reset: number };
    };
    pushResponse({
      endpoint,
      outcome: 'ok',
      budget: data.rateLimit,
      message: 'ok',
      ms,
    });
    return;
  }

  pushResponse({
    endpoint,
    outcome: result.error.code as
      | 'rate_limited'
      | 'unauthorized'
      | 'validation'
      | 'internal',
    key: reject?.key,
    budget: reject?.budget,
    message: result.error.userMessage,
    ms,
  });
};

// Build a sign-in FormData for the active identity with a deliberately wrong password.
const signInForm = (email: string): FormData => {
  const fd = new FormData();
  fd.set('email', email);
  fd.set('password', 'definitely-the-wrong-password');
  fd.set('next', '');
  return fd;
};

// Read the live per-IP remaining off `getRemaining` (consumes no budget) so a non-ok
// row can still show the budget the action's gate just spent. Degrades to undefined if
// the limiter is an inert stub (scaffold state).
const readIpBudget = async (
  ipKey: string,
  limit: number,
): Promise<InspectorResponse['budget']> => {
  try {
    const { remaining, reset } = await signInLimiter.getRemaining(ipKey);
    return {
      limit,
      remaining,
      reset: Math.max(0, Math.ceil((reset - Date.now()) / 1000)),
    };
  } catch {
    return undefined;
  }
};

const callSignIn = async (
  email: string,
): Promise<{ ms: number; rejected: boolean }> => {
  const ipKey = `ip:${getClientIp(await headers())}`;
  const start = performance.now();
  const result = await signInAction(null, signInForm(email));
  const ms = performance.now() - start;
  // The real action keyed both gates; track them so "Reset counters" clears them.
  recordSeenKey('rl:signin', ipKey);
  recordSeenKey('rl:signin', `email:${email}`);
  // The per-IP budget declines row-by-row: read it off getRemaining so the unauthorized
  // rows show 9 → 0 (the error Result carries no budget). On the rate_limited row, show
  // the rejected ip: key instead of the budget (operator-honest gate reference).
  const rejected = !result.ok && result.error.code === 'rate_limited';
  const budget = rejected
    ? undefined
    : await readIpBudget(ipKey, LIMITER_MAX.signin);
  const key = rejected ? ipKey : undefined;
  record('sign-in', result, ms, { key, budget });
  return { ms, rejected };
};

// Sign-up uses a distinct random-suffix email each call so the per-IP gate (not a
// per-email gate) is what trips — proving the key choice.
const callSignUp = async (): Promise<void> => {
  const ipKey = `ip:${getClientIp(await headers())}`;
  const fd = new FormData();
  fd.set('name', 'Spam Runner');
  fd.set(
    'email',
    `runner+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
  );
  fd.set('password', 'correct-horse-staple');
  const start = performance.now();
  const result = await signUpAction(null, fd);
  recordSeenKey('rl:signup', ipKey);
  const key = result.ok ? undefined : ipKey;
  record('sign-up', result, performance.now() - start, { key });
};

// Reset runs against eve@example.com (the seeded reset target) under the email mock
// so the mock-email counter ticks deterministically with no live Resend call.
const callReset = async (email: string): Promise<void> => {
  const fd = new FormData();
  fd.set('email', email);
  process.env.INSPECTOR_MOCK_EMAIL = '1';
  const start = performance.now();
  const result = await resetAction(null, fd);
  const ip = getClientIp(await headers());
  recordSeenKey('rl:reset', `ip:${ip}`);
  recordSeenKey('rl:reset', `email:${email}`);
  record('reset', result, performance.now() - start);
};

const activeEmail = (): string =>
  IDENTITY_EMAIL[inspectorState.activeIdentity] ?? 'alice@example.com';

// Run a gate through the REAL `safeLimit` with a real limiter. The `as never` cast is
// the start-stub seam: in start/ the limiter is an inert `{} as unknown as Ratelimit`
// and `safeLimit`'s first param is typed `never`, so the cast lets this provided file
// compile byte-identically against both the stub and the filled-in solution.
const runGate = (
  limiter: typeof signInLimiter,
  prefix: string,
  key: string,
): ReturnType<typeof safeLimit> => safeLimit(limiter as never, prefix, key);

// ── Inspector-owned down-backed sign-in runner ──────────────────────────────
// "Force Upstash down" makes the spam runner exercise the REAL `safeLimit` against a
// limiter whose client is `makeDownRedis()` (every `limit()` throws
// UpstashConnectionError). `safeLimit` catches it, logs `rate_limit_unavailable`, and
// returns `{ success: true }` — so the request proceeds to the credential check
// (outcome `unauthorized`) and the gate never rejects. This proves the student's
// fail-open path without a `new Ratelimit` outside lib/rate-limit.ts: `safeLimit` only
// calls `.limit(key)`, so the down-redis object slots in as the limiter at that seam.
const downLimiter = makeDownRedis();

const callSignInFailOpen = async (email: string): Promise<void> => {
  const start = performance.now();
  // Both gates go through the real safeLimit against the down client → both log
  // rate_limit_unavailable and return success (fail-open).
  await safeLimit(downLimiter, 'rl:signin', 'ip:down');
  await safeLimit(downLimiter, 'rl:signin', `email:${email}`);
  // The gate let it through; the credential check still runs (wrong password →
  // unauthorized), proving the auth path stays up while Redis is unreachable.
  let result: Awaited<ReturnType<typeof signInAction>>;
  try {
    await auth.api.signInEmail({
      body: { email, password: 'definitely-the-wrong-password' },
    });
    result = ok({
      redirectTo: '/dashboard',
      rateLimit: { limit: 0, remaining: 0, reset: 0 },
    });
  } catch (e) {
    result = mapAuthError(e);
  }
  record('sign-in', result, performance.now() - start);
};

// "Spam X" — run the target action its over-budget count deterministically.
export const spamSignIn = async (): Promise<void> => {
  const email = activeEmail();
  if (inspectorState.toggles.forceDown) {
    // Fail-open demo: 15 calls, all proceed, every call logs rate_limit_unavailable.
    for (let i = 0; i < 15; i += 1) {
      await callSignInFailOpen(email);
    }
    refresh();
    return;
  }
  if (inspectorState.toggles.gateAfterWork) {
    // Gate-before-vs-after timing demo (toggle ON): the readout shows past-budget calls
    // paying the hash. The student's action is always gate-before; this runs the
    // alternate ordering to show why gate-before is correct.
    await runTimingSignIn();
    refresh();
    return;
  }
  // Normal 11× run against the real (gate-before) action. Also set the gate-before
  // timing baseline from the rejected (past-budget) calls — they skip the hash, so the
  // readout is low. With the toggle ON the gate-after runner pays the hash on those
  // same calls and the readout rises (the relative-timing comparison).
  const rejectedMs: number[] = [];
  for (let i = 0; i < 11; i += 1) {
    const { ms, rejected } = await callSignIn(email);
    if (rejected) {
      rejectedMs.push(ms);
    }
  }
  if (rejectedMs.length > 0) {
    inspectorState.timingMs =
      rejectedMs.reduce((a, b) => a + b, 0) / rejectedMs.length;
  }
  refresh();
};

export const spamSignUp = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) {
    await callSignUp();
  }
  refresh();
};

// "Spam reset" is the per-email demonstration: 4 reset calls against eve across 4
// DISTINCT synthetic `ip:` keys (a cross-host campaign), so every per-IP bucket stays
// fresh and the 4th trips on the per-email gate (key: email:eve@example.com), logging
// the honest row. The three successful resets each fire one mocked send, so the
// mock-email counter ticks by exactly 3. Inspector-owned because a Server Action can't
// inject a fake x-forwarded-for into the student action's getClientIp(await headers()).
export const spamReset = async (): Promise<void> => {
  const email = 'eve@example.com';
  process.env.INSPECTOR_MOCK_EMAIL = '1';
  for (let i = 0; i < 4; i += 1) {
    const start = performance.now();
    const syntheticIp = `ip:synthetic-${i}-${Date.now()}`;
    const ipLimit = await runGate(resetLimiter, 'rl:reset', syntheticIp);
    recordSeenKey('rl:reset', syntheticIp);
    if (!ipLimit.success) {
      await rateLimited(ipLimit, 'ip', syntheticIp);
      record('reset', err('rate_limited', OPAQUE), performance.now() - start, {
        key: syntheticIp,
      });
      continue;
    }
    const emailLimit = await runGate(
      resetLimiter,
      'rl:reset',
      `email:${email}`,
    );
    recordSeenKey('rl:reset', `email:${email}`);
    if (!emailLimit.success) {
      await rateLimited(emailLimit, 'email', `email:${email}`);
      record('reset', err('rate_limited', OPAQUE), performance.now() - start, {
        key: `email:${email}`,
      });
      continue;
    }
    // Gates passed: fire the real (mocked) send so the mock-email counter ticks.
    let result: Awaited<ReturnType<typeof resetAction>>;
    try {
      await auth.api.requestPasswordReset({
        body: { email, redirectTo: '/sign-in' },
      });
      result = ok<{ sent: true }>({ sent: true });
    } catch (e) {
      result = mapAuthError(e);
    }
    record('reset', result, performance.now() - start);
  }
  refresh();
};

// "Send one" — drives the after()-vs-await-pending timing demo. The inspector-owned
// runner measures the SAME gate-only operation in both toggle states, differing only in
// whether `pending` is awaited on the path: toggle OFF leaves the analytics flush to
// after() (off-path, low per-call ms); toggle ON awaits it inline (the round-trip lands
// on the path, higher per-call ms). The student's real action always uses after(pending)
// off-path, proven by the after(`/`from 'next/server' static grep. Measuring gate-only
// (no password hash) keeps the two readings comparable so the difference isolates the
// analytics round-trip the toggle introduces.
export const sendOneSignIn = async (): Promise<void> => {
  await runTimingAwaitPending();
  refresh();
};

export const sendOneSignUp = async (): Promise<void> => {
  await callSignUp();
  refresh();
};

export const sendOneReset = async (): Promise<void> => {
  await callReset('eve@example.com');
  refresh();
};

// "Reset Upstash counters" — clear the inspector log, truncate rate_limit_log, and
// clear the touched Redis keys so re-spamming an exhausted budget gives a clean slate
// without a dev-server restart. `resetUsedTokens(key)` deletes every sliding-window
// bucket for the identifier AND pops the limiter's in-memory ephemeralCache block, so
// a previously-blocked key is genuinely fresh. Defensive: a limiter may be an inert
// stub in scaffold state, or a key may already be gone — ignore per-key failures.
export const resetCounters = async (): Promise<void> => {
  clearResponses();
  try {
    await db.delete(rateLimitLog);
  } catch {
    // Table may not exist yet in a fresh scaffold; ignore.
  }
  const limiterByPrefix: Record<string, typeof signInLimiter | undefined> = {
    'rl:signin': signInLimiter,
    'rl:signup': signUpLimiter,
    'rl:reset': resetLimiter,
  };
  for (const { prefix, key } of drainSeenKeys()) {
    const limiter = limiterByPrefix[prefix];
    if (!limiter) {
      continue;
    }
    try {
      await limiter.resetUsedTokens(key);
    } catch {
      // Stub state, or the key is already clear — ignore.
    }
  }
  refresh();
};

// Identity switcher — sets the active identity used for `email:` keys and spam targets.
export const setIdentity = async (identity: ActiveIdentity): Promise<void> => {
  inspectorState.activeIdentity = identity;
  refresh();
};

// Failure-mode toggles. All toggle state is inspector state, never a flag the
// student's action reads — the toggles drive the inspector-owned runners below.
export const toggleForceDown = async (): Promise<void> => {
  inspectorState.toggles.forceDown = !inspectorState.toggles.forceDown;
  refresh();
};

export const toggleGateAfterWork = async (): Promise<void> => {
  inspectorState.toggles.gateAfterWork = !inspectorState.toggles.gateAfterWork;
  refresh();
};

export const toggleAwaitPending = async (): Promise<void> => {
  inspectorState.toggles.awaitPending = !inspectorState.toggles.awaitPending;
  refresh();
};

// ── Timing runners ──────────────────────────────────────────────────────────
// The gate-before-work / await-pending demos are relative-timing demos: they measure
// per-call wall time and set `timingMs`, so the readout differs in the documented
// direction when toggled. They never touch the student's action (always gate-before
// with after(pending)); they assemble the alternate ordering from the imported limiter
// + safeLimit to show WHY the student's ordering is correct.

const hashCost = async (email: string): Promise<void> => {
  // A real over-the-network credential check — the ~80-150ms password hash the
  // gate-before path skips once the budget is exhausted. Wrong password → it throws;
  // we swallow it (we measure the cost, not the outcome).
  try {
    await auth.api.signInEmail({
      body: { email, password: 'definitely-the-wrong-password' },
    });
  } catch {
    // Expected: wrong password. The cost was paid regardless.
  }
};

// Run the sign-in gate N times, measure the average per-call ms, set timingMs.
// gateAfterWork=false: gate first; once the budget is exhausted, skip the hash (cheap).
// gateAfterWork=true: pay the hash on EVERY call, then gate — so past-budget calls stay
// expensive. The two readouts differ in the expected direction.
const runTimingSignIn = async (): Promise<void> => {
  const email = activeEmail();
  const ipKey = `ip:timing-${Date.now()}`;
  recordSeenKey('rl:signin', ipKey);
  const samples: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const start = performance.now();
    if (inspectorState.toggles.gateAfterWork) {
      // Wrong order: hash first, gate after — every call pays the hash, even past budget.
      await hashCost(email);
      await runGate(signInLimiter, 'rl:signin', ipKey);
    } else {
      // Correct order: gate first; skip the hash once the gate rejects (past budget).
      const gateResult = await runGate(signInLimiter, 'rl:signin', ipKey);
      if (gateResult.success) {
        await hashCost(email);
      }
    }
    samples.push(performance.now() - start);
  }
  // Average the past-budget tail (calls 11-12), where the orderings diverge most.
  const tail = samples.slice(10);
  inspectorState.timingMs = tail.reduce((a, b) => a + b, 0) / tail.length;
};

// Run a single sign-in gate, flush analytics either off-path (after()-baseline) or by
// awaiting `pending` inline. awaitPending=true adds the analytics round-trip to the
// measured per-call ms; awaitPending=false leaves it off the path.
const runTimingAwaitPending = async (): Promise<void> => {
  const samples: number[] = [];
  // A fresh key per iteration keeps every gate a clean Redis round-trip (no cache-block
  // short-circuit), and a larger sample averages out local round-trip jitter so the
  // one-extra-round-trip the await-on-path adds is visible above the noise floor.
  for (let i = 0; i < 24; i += 1) {
    const ipKey = `ip:await-${Date.now()}-${i}`;
    recordSeenKey('rl:signin', ipKey);
    const start = performance.now();
    const gateResult = await runGate(signInLimiter, 'rl:signin', ipKey);
    if (inspectorState.toggles.awaitPending) {
      // Wrong: await the analytics flush on the path — adds the round-trip to latency.
      await gateResult.pending;
    }
    // Correct baseline: leave gate.pending to after() (off-path) — not awaited here.
    const elapsed = performance.now() - start;
    // Drop the first sample (connection/JIT warmup) so it doesn't skew the small mean.
    if (i > 0) {
      samples.push(elapsed);
    }
  }
  inspectorState.timingMs = samples.reduce((a, b) => a + b, 0) / samples.length;
};

// Inspector-owned "Distinct IPs runner" (sign-in). A Server Action cannot inject a
// fake x-forwarded-for into the student's getClientIp(await headers()), so this runner
// assembles the gate itself from the imported limiter + safeLimit: each iteration uses
// a fresh synthetic `ip:` key but the SAME `email:<target>` key — so the per-email key
// counts down while every per-IP key stays fresh, proving the cross-IP per-email catch
// through the same keys the real action uses. On the rejecting gate it logs the honest
// rate_limit_rejected row (via rateLimited) keyed on email:<target> and records the
// outcome in the responses log.
export const spoofIpSignIn = async (): Promise<void> => {
  const email = activeEmail();
  for (let i = 0; i < 11; i += 1) {
    const start = performance.now();
    const syntheticIp = `ip:synthetic-${i}-${Date.now()}`;
    await runGate(signInLimiter, 'rl:signin', syntheticIp);
    recordSeenKey('rl:signin', syntheticIp);
    const emailLimit = await runGate(
      signInLimiter,
      'rl:signin',
      `email:${email}`,
    );
    recordSeenKey('rl:signin', `email:${email}`);
    if (!emailLimit.success) {
      // The per-email gate caught the cross-IP burst — log the honest row keyed on
      // email:<target> and record a rate_limited outcome. (The per-IP key stayed fresh.)
      await rateLimited(emailLimit, 'email', `email:${email}`);
      record(
        'sign-in',
        err('rate_limited', OPAQUE),
        performance.now() - start,
        {
          key: `email:${email}`,
        },
      );
    } else {
      record(
        'sign-in',
        ok({
          redirectTo: '/dashboard',
          rateLimit: rateLimitBudget(emailLimit),
        }),
        performance.now() - start,
      );
    }
  }
  refresh();
};

// Inspector-owned "Distinct IPs runner" (reset). Runs one more reset gate against eve
// with a fresh synthetic `ip:` key — proving the per-email reset gate survives an IP
// switch: the fresh ip: key passes, but the exhausted email:eve key still rejects, and
// the honest rate_limit_rejected row is keyed on email:eve@example.com.
export const distinctIpReset = async (): Promise<void> => {
  const email = 'eve@example.com';
  const start = performance.now();
  const syntheticIp = `ip:synthetic-switch-${Date.now()}`;
  await runGate(resetLimiter, 'rl:reset', syntheticIp);
  recordSeenKey('rl:reset', syntheticIp);
  const emailLimit = await runGate(resetLimiter, 'rl:reset', `email:${email}`);
  recordSeenKey('rl:reset', `email:${email}`);
  if (!emailLimit.success) {
    await rateLimited(emailLimit, 'email', `email:${email}`);
    record('reset', err('rate_limited', OPAQUE), performance.now() - start, {
      key: `email:${email}`,
    });
  } else {
    record(
      'reset',
      ok<{ sent: true }>({ sent: true }),
      performance.now() - start,
    );
  }
  refresh();
};

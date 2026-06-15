import { afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Lesson 2 gate — the env boundary now requires the two Upstash credentials,
// and `lib/rate-limit.ts` stands up three live `Ratelimit` instances reading
// their remaining budget straight from Redis. This suite drives the student's
// public surface only: it re-evaluates `@/env` with a credential removed to
// prove the boot fails, and it calls each limiter's `getRemaining` against the
// same live Upstash the inspector reads — never the panel UI (node env, no DOM)
// and never a re-declared copy of the budgets.
//
// Live Upstash is required, exactly like the inspector at runtime. Provision a
// database (free tier) and set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// in `.env`; the suite loads `.env` itself because vitest does not. The reads
// are non-consuming (`getRemaining`) and every write uses a unique per-run key,
// so running the suite never burns a real user's budget.
// ---------------------------------------------------------------------------

// `@/lib/redis` opens with `import 'server-only'`, a marker that throws the
// instant it loads outside the React Server runtime. Vitest's node env is not
// that runtime, so we swap it for an empty module. Harness concern only.
vi.mock('server-only', () => ({}));

// vitest does not auto-load `.env`; `@/env` validates `process.env` at module
// load and `Redis.fromEnv()` reads the two Upstash vars from it, so we load it
// here first. After this, process.env carries the student's real credentials.
process.loadEnvFile(new URL('../../.env', import.meta.url));

// Public surface: the three limiters and the static budget cap the inspector
// pairs against `getRemaining`. We assert remaining vs. the limiter's own
// reported `limit`, never a constant re-declared in the test.
const { signInLimiter, signUpLimiter, resetLimiter, LIMITER_MAX } =
  await import('@/lib/rate-limit');

// A fresh identifier per call so a never-seen key reads at full budget and our
// probe writes never collide with a previous run's window or a real user.
let counter = 0;
const freshId = (tag: string) => `l2probe:${tag}:${Date.now()}:${counter++}`;

// ---------------------------------------------------------------------------
// Requirement 1 — env is the prerequisite gate: a missing Upstash credential
// fails the boot with a Zod error naming the variable, not at the first Redis
// call. We re-evaluate `@/env` with one var removed and assert it throws.
// ---------------------------------------------------------------------------
describe('a missing Upstash credential fails the boot', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Importing the env boundary with one credential removed. The validation
  // failure surfaces twice: the boundary throws (failing the boot), and the
  // offending variable is named in the Zod issues logged to console.error. We
  // capture both so a failure tells the student which signal is missing.
  const bootWithMissing = async (variable: string) => {
    vi.resetModules();
    vi.stubEnv(variable, '');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let thrown: unknown;
    try {
      await import('@/env');
    } catch (e) {
      thrown = e;
    }

    const logged = errorSpy.mock.calls
      .map((args) => args.map((a) => JSON.stringify(a)).join(' '))
      .join(' | ');
    errorSpy.mockRestore();
    return { thrown, logged };
  };

  it('throws when UPSTASH_REDIS_REST_URL is absent and the error names the variable', async () => {
    const { thrown, logged } = await bootWithMissing('UPSTASH_REDIS_REST_URL');

    expect(
      thrown,
      'With UPSTASH_REDIS_REST_URL empty/missing, importing the env boundary must throw at load — the credential gate fails the boot rather than surfacing at the first Redis call. It did not throw, so the Upstash vars are not part of the server schema in src/env.ts (or not wired into runtimeEnv).',
    ).toBeDefined();

    expect(
      logged,
      `The boot failure must name the offending variable so the operator knows which credential is missing. The validation error did not mention UPSTASH_REDIS_REST_URL (logged: ${logged.slice(0, 200)}). Add UPSTASH_REDIS_REST_URL: z.url() to the server schema in src/env.ts.`,
    ).toContain('UPSTASH_REDIS_REST_URL');
  });

  it('throws when UPSTASH_REDIS_REST_TOKEN is absent and the error names the variable', async () => {
    const { thrown, logged } = await bootWithMissing(
      'UPSTASH_REDIS_REST_TOKEN',
    );

    expect(
      thrown,
      'With UPSTASH_REDIS_REST_TOKEN empty/missing, importing the env boundary must throw at load. It did not, so the token is not validated by the server schema in src/env.ts.',
    ).toBeDefined();

    expect(
      logged,
      `The boot failure must name UPSTASH_REDIS_REST_TOKEN. Logged: ${logged.slice(0, 200)}. Add UPSTASH_REDIS_REST_TOKEN: z.string().min(1) to the server schema in src/env.ts.`,
    ).toContain('UPSTASH_REDIS_REST_TOKEN');
  });

  it('boots when both Upstash credentials are present', async () => {
    vi.resetModules();

    let thrown: unknown;
    try {
      await import('@/env');
    } catch (e) {
      thrown = e;
    }

    expect(
      thrown,
      `With both Upstash vars set in .env the env boundary must load cleanly. It threw (${String(
        thrown,
      ).slice(
        0,
        200,
      )}). If this fails after the missing-var tests pass, a stale env stub leaked — or .env is missing one of the Upstash credentials.`,
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Requirement 3 — each limiter reports its live remaining budget at full count
// on a never-seen key, straight from Redis. This is the observable the
// "Remaining tokens" panel renders (signin 10, signup 5, reset 3). We read each
// limiter's own `limit` as the denominator rather than a re-declared constant,
// and confirm it matches the provided LIMITER_MAX cap the panel pairs against.
// ---------------------------------------------------------------------------
describe('each limiter reports full remaining budget on a fresh key', () => {
  it('signin reads remaining === 10 at full budget', async () => {
    const { remaining, limit } = await signInLimiter.getRemaining(
      freshId('signin'),
    );
    expect(
      { remaining, limit },
      `A fresh sign-in key must read at full budget — remaining must equal the limiter's own limit (10), the "signin → 10/10" panel row. Got remaining=${remaining}, limit=${limit}. If both are undefined the limiter is still the {} as unknown as Ratelimit stub; if remaining is below limit a prior probe leaked into this key.`,
    ).toEqual({ remaining: 10, limit: 10 });
    expect(
      limit,
      `The panel pairs getRemaining().remaining with the static LIMITER_MAX.signin cap as the denominator, so the live limit must match it. limiter limit=${limit}, LIMITER_MAX.signin=${LIMITER_MAX.signin}. Set slidingWindow(10, '1 m') for signInLimiter.`,
    ).toBe(LIMITER_MAX.signin);
  });

  it('signup reads remaining === 5 at full budget', async () => {
    const { remaining, limit } = await signUpLimiter.getRemaining(
      freshId('signup'),
    );
    expect(
      { remaining, limit },
      `A fresh sign-up key must read "signup → 5/5". Got remaining=${remaining}, limit=${limit}. Set slidingWindow(5, '10 m') for signUpLimiter.`,
    ).toEqual({ remaining: 5, limit: 5 });
    expect(limit, 'signup limit must equal LIMITER_MAX.signup (5).').toBe(
      LIMITER_MAX.signup,
    );
  });

  it('reset reads remaining === 3 at full budget', async () => {
    const { remaining, limit } = await resetLimiter.getRemaining(
      freshId('reset'),
    );
    expect(
      { remaining, limit },
      `A fresh reset key must read "reset → 3/3" — the tightest budget. Got remaining=${remaining}, limit=${limit}. Set slidingWindow(3, '15 m') for resetLimiter.`,
    ).toEqual({ remaining: 3, limit: 3 });
    expect(limit, 'reset limit must equal LIMITER_MAX.reset (3).').toBe(
      LIMITER_MAX.reset,
    );
  });
});

// ---------------------------------------------------------------------------
// Requirement 4 — reading the panel never spends budget. The inspector reads
// via getRemaining (non-consuming); a second read of the same key must report
// the same remaining. Were the readout wired to limit() instead, the second
// read would decrement and the panel would lock the user out through itself.
// ---------------------------------------------------------------------------
describe('reading remaining is non-consuming', () => {
  it('two consecutive getRemaining reads do not decrement the budget', async () => {
    const key = freshId('nonconsuming');

    const first = await signInLimiter.getRemaining(key);
    const second = await signInLimiter.getRemaining(key);

    expect(
      second.remaining,
      `getRemaining must not consume a token: a second read of the same key must report the same remaining as the first (${first.remaining}), got ${second.remaining}. A drop of 1 means the readout path is calling limit() instead of getRemaining() — that would burn a token per inspector render.`,
    ).toBe(first.remaining);
    expect(
      second.remaining,
      `Neither read may have spent budget: remaining must still be the full ${first.limit}, got ${second.remaining}.`,
    ).toBe(first.limit);
  });
});

// ---------------------------------------------------------------------------
// Requirement 5 — each limiter carries its own prefix, so two limiters cannot
// collide on a shared identifier. We spend a token on one limiter, then read
// the SAME identifier on a different-prefix limiter: it must still be full.
// Only distinct Redis-key prefixes keep that isolation.
// ---------------------------------------------------------------------------
describe('distinct prefixes isolate limiters that share an identifier', () => {
  it('spending sign-in budget does not touch sign-up budget for the same id', async () => {
    const id = freshId('shared-id');

    const spent = await signInLimiter.limit(id);
    expect(
      spent.remaining,
      `Consuming one sign-in token for "${id}" should drop sign-in's remaining to 9 (from 10). Got ${spent.remaining}. If undefined the limiter is still a stub.`,
    ).toBe(9);

    const signUpView = await signUpLimiter.getRemaining(id);
    expect(
      signUpView.remaining,
      `Sign-up budget for the SAME identifier must be untouched (full ${LIMITER_MAX.signup}) — the two limiters live under different Redis prefixes (rl:signin vs rl:signup). Got ${signUpView.remaining}. A value of ${LIMITER_MAX.signup - 1} or below means the limiters share a key namespace: give each its own distinct prefix.`,
    ).toBe(LIMITER_MAX.signup);

    const resetView = await resetLimiter.getRemaining(id);
    expect(
      resetView.remaining,
      `Reset budget for the same identifier must also be untouched (full ${LIMITER_MAX.reset}). Got ${resetView.remaining}. The reset limiter needs its own distinct prefix (rl:reset).`,
    ).toBe(LIMITER_MAX.reset);
  });

  it('spending reset budget does not touch sign-in budget for the same id', async () => {
    const id = freshId('shared-id-2');

    const spent = await resetLimiter.limit(id);
    expect(
      spent.remaining,
      `Consuming one reset token for "${id}" should drop reset's remaining to 2 (from 3). Got ${spent.remaining}.`,
    ).toBe(2);

    const signInView = await signInLimiter.getRemaining(id);
    expect(
      signInView.remaining,
      `Sign-in budget for the same identifier must be full (${LIMITER_MAX.signin}) — distinct prefixes (rl:reset vs rl:signin) keep the two from colliding. Got ${signInView.remaining}.`,
    ).toBe(LIMITER_MAX.signin);
  });
});

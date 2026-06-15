import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Lesson 2 — Type-safe environment variables with @t3-oss/env-nextjs.
//
// The single tested requirement (req 1): removing DATABASE_URL makes the build
// fail with an error that names the missing variable; restoring it makes the
// build pass. We do not shell out to `next build` here — that boundary is the
// import of `@/env`. When `next build` evaluates the app it imports env.ts,
// `createEnv` validates `process.env` against the schema, and a missing
// required variable throws *at import time* with the variable named in the
// reported issues. That same throw is what aborts the build. So importing
// `@/env` under a controlled `process.env` reproduces the build-time behavior
// faithfully and in milliseconds: a successful import == a passing build, a
// throw naming DATABASE_URL == the build failure the student must produce.
//
// env.ts ships complete in both start and solution, so this spec is green from
// the moment the env boundary is wired through `@/env`. It exists to lock the
// boundary in place: a later edit that drops validation (e.g. flipping on
// skipValidation) or stops routing config through the typed export turns these
// red and tells the student which guarantee they lost.

// createEnv reads the three vars via its runtimeEnv map, which points at
// process.env. We swap process.env per scenario and re-import env.ts from a
// clean module cache so each import re-runs validation against the values we set.
const VALID_ENV = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/app',
  DATABASE_URL_UNPOOLED: 'postgres://postgres:postgres@localhost:5432/app',
  SEED: '1',
} as const;

let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  originalEnv = process.env;
  vi.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
});

// Import the env boundary with process.env set to exactly the given map.
// Returns either the imported `env` object or the error createEnv threw, plus
// everything createEnv printed to console.error (where it names bad variables —
// the thrown Error's own message is only the generic "Invalid environment
// variables", so the variable name lives in this captured output, exactly as
// it surfaces in a failing `next build`).
const importEnv = async (vars: Record<string, string | undefined>) => {
  process.env = { ...vars } as NodeJS.ProcessEnv;
  const errorLog: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errorLog.push(
      args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' '),
    );
  });

  let env: unknown;
  let thrown: unknown;
  try {
    ({ env } = await import('@/env'));
  } catch (error) {
    thrown = error;
  } finally {
    spy.mockRestore();
  }

  return { env, thrown, errorLog: errorLog.join('\n') };
};

// Requirement 1 — a missing DATABASE_URL fails the build naming the variable;
// restoring it makes the build pass.
describe('the env boundary validates DATABASE_URL at build time (req 1)', () => {
  it('rejects a missing DATABASE_URL and names it in the failure', async () => {
    const { thrown, errorLog } = await importEnv({
      DATABASE_URL_UNPOOLED: VALID_ENV.DATABASE_URL_UNPOOLED,
      SEED: VALID_ENV.SEED,
      // DATABASE_URL deliberately absent.
    });

    expect(
      thrown,
      'Importing the env boundary with DATABASE_URL unset must throw — that throw is what fails `next build`. It did not throw, so validation is not running (check that env.ts calls createEnv without skipValidation and that DATABASE_URL is a required server var).',
    ).toBeInstanceOf(Error);

    expect(
      errorLog,
      'The build failure must name the missing variable so the developer knows what to fix. "DATABASE_URL" did not appear in createEnv\'s error output — the schema is not validating that variable.',
    ).toContain('DATABASE_URL');
  });

  it('accepts a valid environment and exposes DATABASE_URL through the typed env export', async () => {
    const { env, thrown, errorLog } = await importEnv({ ...VALID_ENV });

    expect(
      thrown,
      `Importing the env boundary with all variables set must succeed — this is the passing build. It threw instead: ${String(thrown)}. The console.error output was:\n${errorLog}`,
    ).toBeUndefined();

    expect(
      (env as { DATABASE_URL?: unknown }).DATABASE_URL,
      'Application code reads config through the typed `env` export, so env.DATABASE_URL must carry the value from the environment. It did not match — config is not flowing through the env boundary.',
    ).toBe(VALID_ENV.DATABASE_URL);
  });

  it('restoring DATABASE_URL turns a failing build back into a passing one', async () => {
    // The remove-then-restore cycle the lesson teaches, as one sequence.
    const removed = await importEnv({
      DATABASE_URL_UNPOOLED: VALID_ENV.DATABASE_URL_UNPOOLED,
      SEED: VALID_ENV.SEED,
    });
    expect(
      removed.thrown,
      'With DATABASE_URL removed the build should fail — the env boundary did not throw.',
    ).toBeInstanceOf(Error);

    vi.resetModules();

    const restored = await importEnv({ ...VALID_ENV });
    expect(
      restored.thrown,
      `Putting DATABASE_URL back must make the build pass again. It still threw: ${String(restored.thrown)}.`,
    ).toBeUndefined();
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Lesson 3 — Finding 001 — wire Sentry across client / server / edge.
//
// The deliverable is the canonical Next.js 16 Sentry setup (three init files + the
// boot instrumentation hook + the withSentryConfig wrapper + the env keys) plus the
// filled finding report. There is no live Sentry round-trip in this node-env gate, so
// these are source-shape probes: each test asserts the OBSERVABLE shape of a file the
// student produces, never a file path or import the student must use a particular way.
// The live-dashboard outcomes (event lands, breadcrumbs, source-mapped stack) are the
// [untested] requirements confirmed by hand against a real DSN.
//
// Self-contained: imports nothing but `vitest` and node built-ins, and inlines its own
// readers. It deliberately does not match exact heading strings or full file bodies —
// only the load-bearing tokens a correct seam must carry.

// Read a project file relative to the project root (two levels up from tests/lessons/).
// Keep the base as a URL (never fileURLToPath it) so a path with spaces resolves.
const readProjectFile = (rel: string): string =>
  readFileSync(new URL(rel, new URL('../../', import.meta.url)), 'utf8');

// Read an optional file: returns null when it doesn't exist yet (so the failure message
// can name "create this file" rather than crashing the whole run on a missing import).
const tryRead = (rel: string): string | null => {
  try {
    return readProjectFile(rel);
  } catch {
    return null;
  }
};

// Collapse whitespace so a probe survives the student's own line breaks / spacing.
const flat = (s: string): string => s.replace(/\s+/g, '');

// Strip TS comments (`// …` and `/* … */`) before probing source, so a flag name that
// only appears in an explanatory comment (e.g. "hideSourceMaps was removed in v9+")
// doesn't register as the flag actually being passed.
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Split a finding into its template sections keyed by `## <Name>` heading (lower-cased),
// stripping HTML comments (the TODO skeleton lives in one) so we measure real content.
const sections = (md: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const part of md.split(/^##\s+/m).slice(1)) {
    const newline = part.indexOf('\n');
    const name = (newline === -1 ? part : part.slice(0, newline))
      .trim()
      .toLowerCase();
    const body = newline === -1 ? '' : part.slice(newline + 1);
    out[name] = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  }
  return out;
};

describe('Lesson 3 — Finding 001 — wire Sentry', () => {
  // ── Req 1 ──────────────────────────────────────────────────────────────────────
  // Client, server, and edge initializers each call Sentry.init with the DSN, a trace
  // sample rate, and a release computed from the commit SHA with a 'dev' fallback.
  describe('Req 1 — each runtime initializer calls Sentry.init with DSN, sample rate, and a SHA-derived release', () => {
    const initFiles: [label: string, rel: string][] = [
      ['client', 'instrumentation-client.ts'],
      ['server', 'sentry.server.config.ts'],
      ['edge', 'sentry.edge.config.ts'],
    ];

    for (const [label, rel] of initFiles) {
      describe(`${label} initializer (${rel})`, () => {
        it('exists and calls Sentry.init', () => {
          const src = tryRead(rel);
          expect(
            src,
            `Missing ${rel}. Each runtime (client, server, edge) needs its own Sentry.init file; the ${label} runtime reads from ${rel}.`,
          ).not.toBeNull();
          expect(
            /Sentry\.init\s*\(/.test(src ?? ''),
            `${rel} must call Sentry.init({ ... }) — that is the call that turns the SDK on for the ${label} runtime.`,
          ).toBe(true);
        });

        it('passes the DSN and a trace sample rate to init', () => {
          const src = tryRead(rel) ?? '';
          expect(
            /dsn\s*:/.test(src),
            `${rel} must pass a \`dsn\` to Sentry.init, or events never leave the ${label} runtime.`,
          ).toBe(true);
          expect(
            /tracesSampleRate\s*:/.test(src),
            `${rel} must set \`tracesSampleRate\` so tracing is configured (1.0 locally for full visibility).`,
          ).toBe(true);
        });

        it('derives the release from the commit SHA rather than hardcoding a version', () => {
          const src = tryRead(rel) ?? '';
          expect(
            /release\s*:/.test(src) || /\brelease\b/.test(src),
            `${rel} must tag events with a \`release\` so a regression maps to the deploy that shipped it.`,
          ).toBe(true);
          expect(
            src.includes('VERCEL_GIT_COMMIT_SHA'),
            `${rel} must compute the release from the deploy commit SHA (process.env.VERCEL_GIT_COMMIT_SHA), not a hardcoded string like "v1.0.0" that ties a week of errors to one version.`,
          ).toBe(true);
        });
      });
    }
  });

  // ── Req 2 ──────────────────────────────────────────────────────────────────────
  // The boot instrumentation hook exposes onRequestError so uncaught server / route /
  // action throws are captured; register lazy-imports the matching config per runtime.
  describe('Req 2 — the boot instrumentation hook captures framework-boundary throws', () => {
    const instrumentation = (): string => {
      const src = tryRead('instrumentation.ts');
      if (src === null) {
        throw new Error(
          'Missing instrumentation.ts at the project root — this is the Next.js 16 boot hook that wires Sentry per runtime.',
        );
      }
      return src;
    };

    it('exports onRequestError so uncaught route/action/server-component throws reach Sentry', () => {
      const src = instrumentation();
      expect(
        flat(src).includes('onRequestError') && /export/.test(src),
        'instrumentation.ts must export `onRequestError` (wired to Sentry.captureRequestError). Without it, hitting /api/test/throw renders the default error page and produces NO Sentry event.',
      ).toBe(true);
      expect(
        src.includes('captureRequestError'),
        'onRequestError should be wired to Sentry.captureRequestError — that is the Next.js 16 hook for framework-boundary throws that never reach a try/catch.',
      ).toBe(true);
    });

    it('register() lazy-imports the matching config by NEXT_RUNTIME', () => {
      const src = instrumentation();
      expect(
        /export\s+(async\s+)?function\s+register|export\s+const\s+register/.test(
          src,
        ),
        'instrumentation.ts must export a `register` function — Next.js calls it once per runtime at boot.',
      ).toBe(true);
      expect(
        src.includes('NEXT_RUNTIME'),
        'register() must branch on process.env.NEXT_RUNTIME so the Node SDK loads only in the nodejs runtime and the edge SDK only on the edge.',
      ).toBe(true);
      expect(
        src.includes('./sentry.server.config'),
        'register() must lazy-import ./sentry.server.config for the nodejs runtime.',
      ).toBe(true);
      expect(
        src.includes('./sentry.edge.config'),
        'register() must lazy-import ./sentry.edge.config for the edge runtime.',
      ).toBe(true);
    });
  });

  // ── Req 3 ──────────────────────────────────────────────────────────────────────
  // The build config is wrapped with withSentryConfig carrying ONLY silent, org,
  // project, widenClientFileUpload — so a build with SENTRY_AUTH_TOKEN uploads maps.
  describe('Req 3 — next.config.ts is wrapped with withSentryConfig (the four canonical keys)', () => {
    // Probe the code, not the prose: comments naming the dropped flags (or the wrapper)
    // must not register as the wiring itself.
    const config = (): string => {
      const src = tryRead('next.config.ts');
      if (src === null) {
        throw new Error('Could not read next.config.ts at the project root.');
      }
      return stripComments(src);
    };

    it('wraps the exported config in withSentryConfig', () => {
      const src = config();
      expect(
        src.includes('withSentryConfig'),
        'next.config.ts must wrap the config with withSentryConfig — that is the build-time hook that uploads source maps and injects instrumentation. The bare `export default nextConfig` is the unwired (finding-1) state.',
      ).toBe(true);
      expect(
        /export\s+default\s+withSentryConfig\s*\(/.test(src),
        'The default export must be withSentryConfig(nextConfig, { ... }), so Next.js builds through the Sentry wrapper.',
      ).toBe(true);
    });

    it('passes org, project, and widenClientFileUpload (source maps for browser stacks too)', () => {
      const src = config();
      for (const key of ['org', 'project', 'widenClientFileUpload']) {
        expect(
          new RegExp(`${key}\\s*:`).test(src),
          `withSentryConfig is missing \`${key}\`. org/project address the upload; widenClientFileUpload uploads more App Router client chunks so browser stack traces decode too.`,
        ).toBe(true);
      }
    });

    it('does not carry the stale wizard flags hideSourceMaps / disableLogger', () => {
      const src = config();
      expect(
        /hideSourceMaps\s*:/.test(src),
        '`hideSourceMaps` was removed in @sentry/nextjs v9+ (hidden source maps are the default now) — drop it from withSentryConfig.',
      ).toBe(false);
      expect(
        /disableLogger\s*:/.test(src),
        '`disableLogger` is deprecated/inert under Turbopack — a wizard or stale tutorial may still emit it; drop it from withSentryConfig.',
      ).toBe(false);
    });
  });

  // ── Req 4 ──────────────────────────────────────────────────────────────────────
  // The five Sentry env keys are declared (DSN client-readable, the rest server-only,
  // all optional; release defaulted to the commit SHA / 'dev').
  describe('Req 4 — the five Sentry env keys are declared in the env schema', () => {
    const env = (): string => readProjectFile('src/env.ts');

    it('declares NEXT_PUBLIC_SENTRY_DSN as a client (NEXT_PUBLIC_) key', () => {
      const src = env();
      expect(
        src.includes('NEXT_PUBLIC_SENTRY_DSN'),
        'src/env.ts must declare NEXT_PUBLIC_SENTRY_DSN — the client-readable copy of the one DSN that covers client and server.',
      ).toBe(true);
    });

    it('declares the build-time server keys SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_RELEASE', () => {
      const src = env();
      for (const key of [
        'SENTRY_AUTH_TOKEN',
        'SENTRY_ORG',
        'SENTRY_PROJECT',
        'SENTRY_RELEASE',
      ]) {
        expect(
          src.includes(key),
          `src/env.ts must declare ${key} in the server partition — the Sentry build keys live server-only, never under NEXT_PUBLIC_.`,
        ).toBe(true);
      }
    });

    it('keeps the Sentry keys optional and defaults the release to the SHA / dev', () => {
      const src = flat(env());
      // The auth token gates the upload: optional so an empty value skips upload
      // rather than failing the build.
      expect(
        /SENTRY_AUTH_TOKEN:z\.string\(\)\.optional\(\)/.test(src),
        'SENTRY_AUTH_TOKEN must be optional() — an absent token should skip the source-map upload, not fail the build.',
      ).toBe(true);
      // The release is defaulted from the commit SHA, falling back to 'dev'.
      const releaseDefaulted =
        src.includes('SENTRY_RELEASE') &&
        src.includes('VERCEL_GIT_COMMIT_SHA') &&
        /\.default\(/.test(src);
      expect(
        releaseDefaulted,
        "SENTRY_RELEASE must default to process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' so the release is the deploy SHA in prod and a static marker locally.",
      ).toBe(true);
      expect(
        /NEXT_PUBLIC_SENTRY_DSN:z\.string\(\)\.optional\(\)/.test(src),
        'NEXT_PUBLIC_SENTRY_DSN must be optional() so the dummy local value can stay commented and the SDK no-ops when the DSN is absent.',
      ).toBe(true);
    });
  });

  // ── Req 5 ──────────────────────────────────────────────────────────────────────
  // findings/001-sentry-not-wired.md Fix section is filled, naming the installed seam
  // and the build wiring, with all four rule/location/consequence/fix sections present.
  describe('Req 5 — findings/001-sentry-not-wired.md is a complete finding naming the installed seam', () => {
    const finding = (): string => {
      const src = tryRead('findings/001-sentry-not-wired.md');
      if (src === null) {
        throw new Error(
          'Could not read findings/001-sentry-not-wired.md — it ships as a four-section skeleton to fill.',
        );
      }
      return src;
    };

    it('has Rule, Location, Consequence, and Fix sections, none left empty', () => {
      const s = sections(finding());
      for (const name of ['rule', 'location', 'consequence', 'fix']) {
        expect(
          name in s,
          `findings/001-sentry-not-wired.md is missing its "## ${name}" section — keep all four template headings.`,
        ).toBe(true);
        expect(
          (s[name] ?? '').length,
          `The "${name}" section is empty. The skeleton ships with bare headings; write the ${name} content under it.`,
        ).toBeGreaterThan(40);
      }
    });

    it('names the Sentry-across-runtimes rule and cites chapter 092 lesson 1', () => {
      const rule = (sections(finding()).rule ?? '').toLowerCase();
      expect(
        rule.includes('sentry'),
        'The Rule should name the rule: Sentry initialized across client/server/edge with source maps + a release tag + breadcrumbs.',
      ).toBe(true);
      expect(
        /092.*lesson\s*1|092.*l\s*1|chapter\s*092.*1/.test(rule),
        'The Rule must cite its source lesson by id: chapter 092 lesson 1 (Sentry: capture, releases, breadcrumbs).',
      ).toBe(true);
    });

    it('Fix names the installed seam and the build wiring that now governs captured errors', () => {
      const fix = (sections(finding()).fix ?? '').toLowerCase();
      expect(
        fix.includes('withsentryconfig'),
        'The Fix must name withSentryConfig — the build wrapper that uploads source maps and now governs every captured error.',
      ).toBe(true);
      const namesInitSeam =
        fix.includes('sentry.init') ||
        fix.includes('instrumentation') ||
        fix.includes('onrequesterror');
      expect(
        namesInitSeam,
        'The Fix must name the installed seam — the per-runtime Sentry.init files and the instrumentation hook (onRequestError), not just a diff.',
      ).toBe(true);
      const namesReleaseStrategy =
        fix.includes('sha') ||
        fix.includes('commit') ||
        fix.includes('source map') ||
        fix.includes('source-map');
      expect(
        namesReleaseStrategy,
        'The Fix should name what makes the seam useful: the source-map upload (gated on SENTRY_AUTH_TOKEN) and the SHA-derived release.',
      ).toBe(true);
    });
  });
});

import { describe } from 'vitest';

// Lesson 3 — Finding 001: wire Sentry across client/server/edge. The
// project-lesson-test-coder fills this gate later. It will assert the observable
// shape of findings/001-sentry-not-wired.md (the four sections, the 092 L1 rule, the
// throw-route surface, the withSentryConfig + source-map + git-SHA-release fix) AND
// the source shape of the installed seam (the three Sentry config files export an
// init; instrumentation.ts exports onRequestError; next.config.ts references
// withSentryConfig) — read as readFileSync source-shape probes, never importing the
// seam (node env, no DOM).
describe.todo('Lesson 3 — Finding 001 — wire Sentry');

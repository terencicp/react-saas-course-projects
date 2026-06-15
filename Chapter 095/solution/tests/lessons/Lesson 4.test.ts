import { describe } from 'vitest';

// Lesson 4 — Findings 002 & 003: the production logger seam. The
// project-lesson-test-coder fills this gate later. It will assert the observable
// shape of findings/002-log-secret-leak.md and findings/003-missing-correlation-id.md
// (the four sections, the 092 L3 / L2 rules, the surfaces, the fixes) AND the source
// shape of the installed seam (lib/logger.ts exports a `redact`; proxy.ts references
// `x-request-id`; lib/request-context.ts uses AsyncLocalStorage) — read as readFileSync
// source-shape probes, never importing the seam (node env, no DOM).
describe.todo('Lesson 4 — Findings 002 & 003 — the production logger seam');

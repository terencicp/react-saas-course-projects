import { describe } from 'vitest';

// Lesson 5 — Finding 004: gate PostHog behind consent. The
// project-lesson-test-coder fills this gate later. It will assert the observable
// shape of findings/004-posthog-consent-gate.md (the four sections, the 093 L3 + 081
// L5 rule, the Network surface, the opt_out/opt_in pair + consent.ts seam fix) AND
// the source shape of the installed seam (providers.tsx inits with
// `opt_out_capturing_by_default: true`; ConsentProvider/useConsent is read;
// lib/analytics/consent.ts exports grant/revoke) — read as readFileSync source-shape
// probes, never importing the seam (node env, no DOM).
describe.todo('Lesson 5 — Finding 004 — gate PostHog behind consent');

import { describe } from 'vitest';

// Lesson 6 — Findings 005, 006 & 008: the performance findings + the barrel fix. The
// project-lesson-test-coder fills this gate later. It will assert the observable
// shape of findings/005-rsc-waterfall.md, findings/006-barrel-import.md, and
// findings/008-n-plus-1-invoices.md (the four sections, the 094 L6/L3/L4/L7 rules,
// the trace/analyzer/.toSQL() surfaces, the fixes — and that 006 embeds the
// before/after-barrel.png) AND that the one in-place fix is present (next.config.ts
// lists lucide-react under optimizePackageImports) — read as readFileSync source-shape
// probes (node env, no DOM).
describe.todo(
  'Lesson 6 — Findings 005/006/008 — performance findings + barrel fix',
);

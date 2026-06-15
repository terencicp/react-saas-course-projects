import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Lesson 4 — Finding 003 — the missing audit-log write (lib/billing/transfer-ownership.ts).
//
// This gate is self-contained: it imports only from vitest and node built-ins,
// reads two files off disk, and asserts the OBSERVABLE shape of the deliverable.
// The deliverable is a written finding, so the observable is the finding file's
// prose. There is no running-app fingerprint for this defect (its invisibility at
// runtime is the whole point), so the gate asserts:
//   1. the four template sections of findings/003-audit-log-ownership-transfer.md
//      are populated, the audit-log rule is named, the Location names a grep
//      command + the file, and the Fix names the in-transaction logAudit reach; and
//   2. a source-shape probe that the seeded defect is STILL present —
//      transferBillingOwnership writes no audit row — proving the student
//      documented the defect rather than patching the read-only target.

// Walk up from this test file to the project root (the dir holding package.json).
// Works whether this file lives in tests/lessons/ or lesson-verification/.
const projectRoot = (() => {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    dir = dirname(dir);
  }
  throw new Error(
    'Could not locate the project root (no package.json found walking up from the test file).',
  );
})();

const FINDING_PATH = join(
  projectRoot,
  'findings',
  '003-audit-log-ownership-transfer.md',
);
const TARGET_PATH = join(
  projectRoot,
  'src',
  'lib',
  'billing',
  'transfer-ownership.ts',
);

const readFinding = () => {
  if (!existsSync(FINDING_PATH)) {
    throw new Error(
      'findings/003-audit-log-ownership-transfer.md is missing. The deliverable for this lesson is that finding file — write it from the template.',
    );
  }
  return readFileSync(FINDING_PATH, 'utf8');
};

// Pull the body text under a `## <heading>` up to the next `## ` heading. HTML
// comments (the TODO skeleton markers) are stripped so an un-filled section reads
// as empty, not "populated".
const sectionBody = (markdown: string, heading: string): string | null => {
  const lines = markdown.split('\n');
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`,
  );
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line.trim()));
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  return body.replace(/<!--[\s\S]*?-->/g, '').trim();
};

describe('Lesson 4 — Finding 003: the missing audit-log write', () => {
  describe('Requirement 1 — all four template sections are populated', () => {
    it('has non-empty Rule, Location, Consequence, and Fix sections', () => {
      const md = readFinding();
      for (const heading of ['Rule', 'Location', 'Consequence', 'Fix']) {
        const body = sectionBody(md, heading);
        expect(
          body,
          `The finding has no "## ${heading}" section. The template ships four sections — Rule, Location, Consequence, Fix — and each must be present.`,
        ).not.toBeNull();
        expect(
          (body ?? '').length,
          `The "## ${heading}" section is empty (only the heading, or just the TODO comment, remains). Write the ${heading} content for finding 003.`,
        ).toBeGreaterThan(20);
      }
    });
  });

  describe('Requirement 2 — the Rule names the audit-log canonical event set with transaction discipline', () => {
    it('names the audit-log event set, transaction discipline, and cites chapter 081 lesson 3', () => {
      const rule = (sectionBody(readFinding(), 'Rule') ?? '').toLowerCase();

      expect(
        /audit[- ]?log|event set/.test(rule),
        'The Rule does not name the audit-log rule. State the rule: every security-relevant mutation co-transacts an audit-log write from the canonical event set.',
      ).toBe(true);

      expect(
        /transaction/.test(rule),
        'The Rule does not mention transaction discipline. The audit write must ride the same transaction as the mutation — a committed change can never exist without its audit row.',
      ).toBe(true);

      expect(
        /081/.test(rule) && /lesson\s*3|\bl3\b|lesson three/.test(rule),
        'The Rule does not cite the source of the rule. The audit-log canonical event set + transaction discipline is chapter 081, lesson 3 — cite it.',
      ).toBe(true);
    });
  });

  describe('Requirement 3 — the Location names a grep command and the defect file', () => {
    it('names a grep/ripgrep command and src/lib/billing/transfer-ownership.ts', () => {
      const location = sectionBody(readFinding(), 'Location') ?? '';

      expect(
        /\b(rg|grep)\b/.test(location),
        'The Location names no grep command. This finding is grep-driven — record the command (e.g. `rg "db.transaction" src/lib`) that surfaced the transactional mutation.',
      ).toBe(true);

      expect(
        /src\/lib\/billing\/transfer-ownership\.ts/.test(location),
        'The Location does not name the defect file. Point at src/lib/billing/transfer-ownership.ts — the transferBillingOwnership mutation that writes no audit row.',
      ).toBe(true);
    });
  });

  describe('Requirement 4 — the Fix names the in-transaction logAudit write with the canonical slug', () => {
    it('names an in-transaction logAudit write and the org.ownership-transferred event', () => {
      const fix = sectionBody(readFinding(), 'Fix') ?? '';
      const fixLower = fix.toLowerCase();

      expect(
        /logaudit/.test(fixLower),
        'The Fix does not name logAudit. The senior reach is to add the audit-log write — name logAudit as the call to add inside the transaction.',
      ).toBe(true);

      expect(
        /\btx\b|transaction/.test(fixLower),
        'The Fix does not say the write rides the transaction. logAudit must take tx (not the global db) as its first argument so it commits/rolls back atomically with the ownership change.',
      ).toBe(true);

      expect(
        /org\.ownership-transferred/.test(fix),
        'The Fix does not name the canonical event slug. The event is `org.ownership-transferred` — the single-dot entity.verb-pasttense form the admin-side transfer already uses.',
      ).toBe(true);
    });
  });

  describe('Requirement 5 — source-shape probe: the seeded defect is still present', () => {
    it('transferBillingOwnership still writes no audit row (the target is read-only)', () => {
      expect(
        existsSync(TARGET_PATH),
        'src/lib/billing/transfer-ownership.ts is missing — the audit target should be unchanged. Do not move or delete the target; this lesson documents, it does not patch.',
      ).toBe(true);

      const source = readFileSync(TARGET_PATH, 'utf8');

      expect(
        /export\s+const\s+transferBillingOwnership/.test(source),
        'transferBillingOwnership is no longer exported from the target. The target is read-only — restore it; the audit documents the defect, it does not refactor the target.',
      ).toBe(true);

      // Strip comments so a "// no logAudit here" note never trips the probe.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');

      expect(
        /\blogAudit\b/.test(code),
        'transferBillingOwnership now writes an audit row — the seeded defect has been patched. This audit is read-only: document the missing write in the finding, do not add it to the target. Revert the change to src/lib/billing/transfer-ownership.ts.',
      ).toBe(false);
    });
  });
});

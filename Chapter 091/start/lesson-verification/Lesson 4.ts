import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The student's deliverable this lesson is itself an integration test file. It runs
// against a real test Postgres and cannot execute inside this node-env, no-DB lesson
// project — so the gate is a SOURCE-SHAPE check (the convention the README documents):
// we read the file the student wrote and prove it asserts each tested requirement.
//
// readSource bases on the project root (one level up from lesson-verification/), then
// joins the deliverable's path. A file: URL base is mandatory — a bare path is not a
// valid `new URL()` base and would throw "Invalid URL".
const readSource = (rel: string) =>
  readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8');

const DELIVERABLE = 'tests/integration/webhook-idempotency.int.test.ts';

// Strip comments, then collapse all runs of whitespace to a single space. We match on
// real test code, not prose: the start stub's TODO comment names "duplicate:true" etc.,
// which would falsely satisfy the assertions if left in.
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1'); // line comments (leave http:// alone)

const flat = () => {
  let raw: string;
  try {
    raw = readSource(DELIVERABLE);
  } catch {
    throw new Error(
      `Could not read ${DELIVERABLE}. Write your replay test in that file (it still holds the TODO(L4) stub).`,
    );
  }
  return stripComments(raw).replace(/\s+/g, ' ');
};

// The TODO stub ships as `describe.todo(...)`, which Vitest collects but never runs.
// Until the student replaces it the file proves nothing, so treat the stub as "unwritten".
const isStillStub = (src: string) =>
  /describe\.todo/.test(src) || /TODO\(L4\)/.test(src);

describe('Lesson 4 — the replay/idempotency test', () => {
  it('sends the same webhook event twice (a true replay, not two distinct events)', () => {
    const src = flat();
    expect(
      isStillStub(src),
      'webhook-idempotency.int.test.ts is still the TODO(L4) stub — replace describe.todo with a real test before this gate can pass.',
    ).toBe(false);

    // postWebhook must be invoked twice — one delivery proves nothing about replays.
    const postWebhookCalls = (src.match(/postWebhook\s*\(/g) ?? []).length;
    expect(
      postWebhookCalls,
      'A replay test must call postWebhook twice — send the SAME event through the handler a first and a second time.',
    ).toBeGreaterThanOrEqual(2);

    // The load-bearing constraint the lesson exists to teach: the dedup key must survive
    // both sends. If each delivery minted a fresh id the second call would be a NEW event,
    // not a replay, and the test would prove nothing. The student pins one eventId and
    // sends one shared `event` object twice (no second checkoutCompleted(...) call).
    const checkoutCompletedCalls = (src.match(/checkoutCompleted\s*\(/g) ?? [])
      .length;
    expect(
      checkoutCompletedCalls,
      'Build ONE event and send it twice — calling checkoutCompleted() again mints a fresh event id, so the second send is a new event, not a replay.',
    ).toBe(1);
    expect(
      /eventId/.test(src),
      'Pin the event id (pass eventId to checkoutCompleted) so both deliveries carry the same dedup key — otherwise the replay is not a true replay.',
    ).toBe(true);
  });

  it('asserts the first send returns 200 with duplicate=false', () => {
    const src = flat();

    expect(
      /\.status\b/.test(src) && /\b200\b/.test(src),
      'Assert the response status is 200 on the first send (the claim-and-dispatch path).',
    ).toBe(true);
    expect(
      /duplicate:\s*false/.test(src),
      'Assert the first send returns { received: true, duplicate: false } — the freshly-claimed path.',
    ).toBe(true);
  });

  it('asserts the second send returns 200 with duplicate=true', () => {
    const src = flat();

    expect(
      /duplicate:\s*true/.test(src),
      'Assert the second send returns { received: true, duplicate: true } — the dedup-hit path operators read in logs.',
    ).toBe(true);
  });

  it('asserts the event is claimed exactly once (processed_events count stays 1)', () => {
    const src = flat();

    expect(
      /processedEvents/.test(src),
      'Query processed_events for the pinned event id to prove the claim row count.',
    ).toBe(true);
    // Read the count and assert it is exactly one ledger row across both sends.
    expect(
      /toHaveLength\(\s*1\s*\)|toEqual\(\s*1\s*\)|\.length\b.*\b1\b|\bto(Be|Equal)\(\s*1\s*\)/.test(
        src,
      ),
      'Assert exactly 1 processed_events row exists for the event id after both sends — the second delivery must not claim again.',
    ).toBe(true);
  });

  it('asserts the entitlement is not re-written (updatedAt unchanged across the second send)', () => {
    const src = flat();

    expect(
      /planEntitlements/.test(src),
      'Read plan_entitlements before and after the second send to prove the entitlement was untouched.',
    ).toBe(true);
    expect(
      /updatedAt/.test(src),
      'Capture plan_entitlements.updatedAt between the two sends and compare it afterwards.',
    ).toBe(true);
    // The capture-and-compare pattern: the post-second-send updatedAt is asserted equal to
    // a value read between the sends (toEqual across two reads, not a hard-coded timestamp).
    expect(
      /toEqual\(/.test(src),
      'Compare the post-second-send updatedAt with the value captured between the two sends (toEqual across two reads reads as "nothing changed").',
    ).toBe(true);
  });

  it('asserts the audit log is not appended twice (audit_logs count stays 1)', () => {
    const src = flat();

    expect(
      /auditLogs/.test(src),
      'Query audit_logs for the org to prove the replay did not append a second audit row.',
    ).toBe(true);
    // The audit count assertion must come after both sends; require a length-1 assertion.
    expect(
      /toHaveLength\(\s*1\s*\)/.test(src),
      'Assert exactly 1 audit_logs row for the org after both sends — a replay must not write a second audit entry.',
    ).toBe(true);
  });
});

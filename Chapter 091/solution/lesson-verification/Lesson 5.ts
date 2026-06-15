import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The student's deliverable this lesson is itself an integration test file. It runs
// against a real test Postgres and drives the real route handler (which imports
// `server-only`), so it cannot execute inside this node-env, no-DB lesson project — so the
// gate is a SOURCE-SHAPE check: we read the file the student wrote and prove it asserts
// each tested requirement (the 400 problem+json contract plus the empty downstream sweep).
//
// readSource bases on the project root (one level up from lesson-verification/), then
// joins the deliverable's path. A file: URL base is mandatory — a bare path is not a
// valid `new URL()` base and would throw "Invalid URL".
const readSource = (rel: string) =>
  readFileSync(new URL(rel, new URL('../', import.meta.url)), 'utf8');

const DELIVERABLE = 'tests/integration/webhook-signature-rejected.int.test.ts';

// Collapse all runs of whitespace to a single space so assertions match regardless of how
// the student formatted line breaks, indentation, or argument wrapping.
const flat = () => {
  let raw: string;
  try {
    raw = readSource(DELIVERABLE);
  } catch {
    throw new Error(
      `Could not read ${DELIVERABLE}. Write your tampered-signature test in that file (it still holds the TODO(L5) stub).`,
    );
  }
  return raw.replace(/\s+/g, ' ');
};

// The TODO stub ships as `describe.todo(...)`, which Vitest collects but never runs.
// Until the student replaces it the file proves nothing, so treat the stub as "unwritten".
const isStillStub = (src: string) =>
  /describe\.todo/.test(src) || /TODO\(L5\)/.test(src);

// A length-0 assertion in any of the spellings the student might reach for: toHaveLength(0),
// .length ... toBe(0)/toEqual(0). The negative sweep ("nothing was written") is the whole
// point of the lesson, so every downstream surface must be asserted empty.
const assertsEmpty = (src: string, table: RegExp) =>
  table.test(src) &&
  /toHaveLength\(\s*0\s*\)|\.length\b[^;]*\bto(Be|Equal)\(\s*0\s*\)|to(Be|Equal)\(\s*0\s*\)/.test(
    src,
  );

describe('Lesson 5 — the signature-tampered rejection test', () => {
  it('feeds a well-formed event through the handler with a tampered signature', () => {
    const src = flat();
    expect(
      isStillStub(src),
      'webhook-signature-rejected.int.test.ts is still the TODO(L5) stub — replace describe.todo with a real test before this gate can pass.',
    ).toBe(false);

    // The corruption lives in the signature, not the body: the event is built normally and
    // sent with { tamperSignature: true } so constructEvent rejects it at the front door.
    expect(
      /postWebhook\s*\(/.test(src),
      'Drive the event through the real handler with postWebhook(event, …) — the rejection must come from the route, not a hand-rolled check.',
    ).toBe(true);
    expect(
      /tamperSignature\s*:\s*true/.test(src),
      'Send the event with { tamperSignature: true } so the route verifies a corrupted signature — that is the input this test exists to reject.',
    ).toBe(true);
  });

  it('Requirement 1 — asserts the request returns 400', () => {
    const src = flat();

    expect(
      /\.status\b/.test(src) && /\b400\b/.test(src),
      'Assert the response status is 400 — a tampered signature is rejected at the front door before any work runs.',
    ).toBe(true);
  });

  it('Requirement 2 — asserts an application/problem+json body of { title: invalid_signature, status: 400 }', () => {
    const src = flat();

    expect(
      /application\/problem\+json/.test(src),
      'Assert the response content-type is application/problem+json — the route answers a verification failure with an RFC 9457 problem document.',
    ).toBe(true);
    expect(
      /invalid_signature/.test(src),
      "Assert the body title is 'invalid_signature' — the machine-readable token the route returns for a bad/missing signature.",
    ).toBe(true);
    // toMatchObject (not toEqual) pins the contract fields without coupling to type:'about:blank';
    // the title+status pair is what proves the problem document, not a body echo of the request.
    expect(
      /toMatchObject\(/.test(src) && /status\s*:\s*400/.test(src),
      "Match the body against { title: 'invalid_signature', status: 400 } with toMatchObject — a verification failure carries no echo of the request body.",
    ).toBe(true);
  });

  it('Requirement 3 — asserts no event is claimed (processed_events rows = 0)', () => {
    const src = flat();

    expect(
      assertsEmpty(src, /processedEvents/),
      'Query processed_events for the event and assert 0 rows — a rejected request must never claim the event.',
    ).toBe(true);
  });

  it('Requirement 4 — asserts the seeded entitlement is untouched (plan still free)', () => {
    const src = flat();

    expect(
      /planEntitlements/.test(src),
      "Read the org's plan_entitlements row to prove the rejected request changed nothing.",
    ).toBe(true);
    expect(
      /['"]free['"]/.test(src),
      "Assert the entitlement plan still reads 'free' (the seed) — a rejected request must not upgrade the org.",
    ).toBe(true);
  });

  it('Requirement 5 — asserts no audit log is written (audit_logs rows = 0)', () => {
    const src = flat();

    expect(
      assertsEmpty(src, /auditLogs/),
      'Query audit_logs for the org and assert 0 rows — nothing downstream ran, so nothing was audited.',
    ).toBe(true);
  });

  it('Requirement 6 — asserts no outbound call fires (resendCalls.length === 0)', () => {
    const src = flat();

    expect(
      assertsEmpty(src, /resendCalls/),
      'Assert resendCalls is empty — a rejected request must not trigger any outbound email; emptiness is what "rejected before any work" means.',
    ).toBe(true);
  });
});

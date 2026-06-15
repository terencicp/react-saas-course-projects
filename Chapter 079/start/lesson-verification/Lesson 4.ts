import { beforeEach, describe, expect, it, vi } from 'vitest';

// The action under test is `authedInputAction('member', createCustomerInput, …)`.
// It resolves the active session from the request via `cookies()` (next/headers)
// and calls `revalidatePath` (next/cache) on the happy path. Neither has a request
// context under vitest's node env, so we stub both:
//   - next/headers → an `acting-identity` cookie naming a seeded member of org-acme
//     (`org-acme:member`, the user `user-acme-member`), exactly as the running app
//     would. The action still does the real work; only the request edge is faked.
//   - next/cache → `revalidatePath` is a no-op (cache invalidation is irrelevant to
//     the write, and calling the real one outside a request throws).
// With those in place `createCustomer(input)` runs end to end against the shared
// in-memory store, so we assert against the store's observable rows.
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'acting-identity'
        ? { name, value: 'org-acme:member' }
        : undefined,
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => {},
}));

// The action's dependency chain (audit-log, store, session) is marked
// `server-only`, a guard package that throws if imported off the server. Under
// vitest there is no Next server, so stub it to an empty module — the guard is a
// build-time fence, not behavior we exercise here.
vi.mock('server-only', () => ({}));

import { createCustomer } from '@/app/(app)/customers/new/_lib/wizard/actions';
import { auditLogs, customers, reseed } from '@/server/store';

// The org the mocked session acts in. The seed reuses `dupe@acme.test` for the
// first org-acme customer, which is what makes the conflict path reachable.
const ORG = 'org-acme';

// A composite draft the boundary schema (createCustomerInput) accepts. Every test
// overrides the email so the happy path and conflict path target the rows they
// mean to — the store is keyed on (orgId, email).
const validDraft = (email: string) => ({
  contact: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email,
    phone: '5550123',
  },
  billing: {
    line1: '1 Analytical Way',
    line2: '',
    city: 'London',
    region: 'Greater London',
    postalCode: 'EC1A1BB',
    country: 'GB',
    taxId: 'GB123456789',
    paymentTerms: 'net30' as const,
  },
  preferences: {
    channels: ['email' as const],
    defaultCurrency: 'EUR',
    language: 'en-GB' as const,
  },
});

// Count only the org's `customer.created` rows — the observable the action owns.
const createdAuditCount = () =>
  auditLogs.filter((a) => a.orgId === ORG && a.action === 'customer.created')
    .length;

const customerCount = () => customers.filter((c) => c.orgId === ORG).length;

// Read the success payload's id structurally. The action's TOut is inferred from
// its own return type, which a not-yet-implemented stub can narrow to `never`
// (no ok(...) branch reached). Pulling the id through a local shape keeps the
// runtime assertions exact without coupling the test to that inference.
type ActionResult = Awaited<ReturnType<typeof createCustomer>>;
const successId = (result: ActionResult): string => {
  if (result.ok) {
    const data = result.data as { id?: unknown };
    if (typeof data.id === 'string') {
      return data.id;
    }
  }
  return '';
};

// Reset the shared store before each test so deltas are read against a known seed.
beforeEach(() => {
  reseed();
});

describe('Requirement 1 — a valid composite draft creates the customer and writes one audit row', () => {
  it('returns { ok: true, data: { id } } for a complete, valid draft', async () => {
    const result = await createCustomer(validDraft('new.customer@acme.test'));

    expect(
      result.ok,
      'createCustomer returned a failure for a fully valid draft. The action must re-parse createCustomerInput at the boundary, write the row via pushCustomer, and return ok({ id }). A start-stub that always returns err(internal) lands here — wire up the real authedInputAction body.',
    ).toBe(true);

    expect(
      successId(result).length,
      'The success payload did not carry a non-empty string id. ok({ id: row.id }) must return the new customer row id (not a placeholder empty string) so the submit button can redirect to /customers/[id].',
    ).toBeGreaterThan(0);
  });

  it('writes exactly one customer.created audit row in the active org', async () => {
    const before = createdAuditCount();

    const result = await createCustomer(validDraft('audit.once@acme.test'));

    expect(
      createdAuditCount() - before,
      'A successful submit did not write exactly one customer.created audit row in the active org. The happy path must call logAudit({ orgId: ctx.orgId, action: "customer.created", subjectId: row.id }) once, after the write.',
    ).toBe(1);

    const id = successId(result);
    if (id) {
      const row = auditLogs.find((a) => a.subjectId === id);
      expect(
        row?.action,
        'The audit row for the new customer is not a customer.created entry. logAudit must tag the action "customer.created" and key subjectId to the inserted row id.',
      ).toBe('customer.created');
      expect(
        row?.orgId,
        'The audit row was written to the wrong org. The action must carry ctx.orgId (the session org) into the audit entry — tenancy lives server-side, not in the client store.',
      ).toBe(ORG);
    }
  });
});

describe('Requirement 2 — a malformed composite payload is rejected with no write', () => {
  it("returns { ok: false, error: { code: 'validation' } } for a bad email", async () => {
    const draft = validDraft('not-an-email');

    const result = await createCustomer(draft);

    expect(
      result.ok,
      'A malformed draft (invalid email) was accepted. The boundary re-parse of createCustomerInput must reject it before any write — the client Next-gate is UX-only, the action re-parse is the correctness boundary.',
    ).toBe(false);

    if (!result.ok) {
      expect(
        result.error.code,
        'A malformed draft did not surface as a validation error. authedInputAction must return err("validation", …) when schema.safeParse fails, not internal or conflict.',
      ).toBe('validation');
    }
  });

  it('writes no audit row and no customer when the payload is rejected', async () => {
    const auditBefore = createdAuditCount();
    const customersBefore = customerCount();

    await createCustomer(validDraft('also-not-an-email'));

    expect(
      createdAuditCount(),
      'A rejected submit still wrote an audit row. Validation fails at the boundary before fn runs, so neither pushCustomer nor logAudit should execute.',
    ).toBe(auditBefore);
    expect(
      customerCount(),
      'A rejected submit still inserted a customer. The boundary re-parse must short-circuit before pushCustomer when the payload is malformed.',
    ).toBe(customersBefore);
  });
});

describe('Requirement 3 — a duplicate email is rejected as a conflict, audit log untouched', () => {
  it("returns { ok: false, error: { code: 'conflict' } } for a seeded duplicate email", async () => {
    const result = await createCustomer(validDraft('dupe@acme.test'));

    expect(
      result.ok,
      'Submitting a customer whose email duplicates the seeded dupe@acme.test was accepted. pushCustomer throws a { code: "23505" }-shaped error on a duplicate (orgId, email); the action must catch it.',
    ).toBe(false);

    if (!result.ok) {
      expect(
        result.error.code,
        'A duplicate-email throw was not mapped to a conflict. The catch must detect code === "23505" and return conflict(…) — anything else (internal, validation) means the unique-violation branch is missing.',
      ).toBe('conflict');
    }
  });

  it('leaves the audit log unchanged on a conflict', async () => {
    const before = createdAuditCount();

    await createCustomer(validDraft('dupe@acme.test'));

    expect(
      createdAuditCount(),
      'A conflicting submit changed the audit log. pushCustomer throws before logAudit runs, so the audit log stays clean by ordering — no audit row may be written when the insert is rejected.',
    ).toBe(before);
  });
});

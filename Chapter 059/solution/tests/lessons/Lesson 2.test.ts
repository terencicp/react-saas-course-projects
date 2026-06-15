import { beforeAll, describe, expect, it, vi } from 'vitest';

// Lesson 2 — Organization plugin and the active-org session.
//
// Covers the two [tested] functional requirements:
//   req 3 — roleAtLeast orders the three roles (member < admin < owner).
//   req 4 — requireOrgUser returns { user, orgId, role } for a member of the
//           active org, and redirects to /onboarding/create-org when there is no
//           active org or no membership.
//
// Node env, no DOM. requireOrgUser lives in @/lib/auth, which imports
// `server-only` (throws under Node), the env boundary, and the Better Auth
// instance. We mock only the unavoidable runtime shims — `server-only` to a
// no-op, `next/headers` so `await headers()` does not blow up outside a request —
// then drive the real requireOrgUser through its branches by stubbing the two
// Better Auth calls it reads from (auth.api.getSession / getActiveMember). We
// observe the real return shape and the real redirect target, never source text.

// `server-only` throws on import under Node; neutralise it so @/lib/auth loads.
vi.mock('server-only', () => ({}));
// requireOrgUser's session reads call `await headers()`, which throws outside a
// request scope. A bare Headers object is all the stubbed Better Auth calls need.
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

// The env boundary (@/env) validates process.env at import time; vitest does not
// auto-load .env, so seed the values @/lib/auth's import graph needs. `||=` leaves
// any real environment untouched.
beforeAll(() => {
  process.env.DATABASE_URL ||=
    'postgres://postgres:postgres@localhost:5432/app';
  process.env.DATABASE_URL_UNPOOLED ||=
    'postgres://postgres:postgres@localhost:5432/app';
  process.env.SEED ||= '1';
  process.env.BETTER_AUTH_SECRET ||=
    'dev-only-better-auth-secret-please-rotate-32b';
  process.env.BETTER_AUTH_URL ||= 'http://localhost:3000';
  process.env.RESEND_API_KEY ||= 're_xxx';
  process.env.EMAIL_FROM ||= 'Acme <verify@send.acme.example>';
  process.env.EMAIL_REPLY_TO ||= 'support@acme.example';
  process.env.NEXT_PUBLIC_APP_NAME ||= 'Acme';
  process.env.NEXT_PUBLIC_APP_URL ||= 'http://localhost:3000';
  process.env.INVITATION_SIGNING_SECRET ||=
    'dev-only-invitation-signing-secret-rotate=';
});

// next/navigation's redirect() throws a NEXT_REDIRECT error whose digest encodes
// the destination as `NEXT_REDIRECT;<kind>;<path>;<status>;`. Pull the path out so
// we can assert *where* requireOrgUser sent the user.
const redirectTarget = (e: unknown): string | null => {
  const digest = (e as { digest?: unknown })?.digest;
  if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT')) {
    return digest.split(';')[2] ?? null;
  }
  return null;
};

// A fresh module instance per call: requireOrgUser is wrapped in React cache(), so
// re-importing gives a clean per-test cache and lets us reset the stubbed reads.
const loadAuth = async () => {
  vi.resetModules();
  const mod = await import('@/lib/auth');
  return mod;
};

// Stub the two Better Auth reads requireOrgUser depends on. Direct assignment
// (not vi.spyOn) so it works even before the organization plugin adds
// getActiveMember to auth.api — otherwise the failure would read "property not
// defined" instead of the real "no organization plugin yet" cause.
type SessionStub = {
  user: { id: string; email: string; name: string };
  session: { activeOrganizationId: string | null };
} | null;

const stubAuth = (
  auth: { api: Record<string, unknown> },
  opts: { session: SessionStub; member: { role: string } | null },
) => {
  auth.api.getSession = vi.fn().mockResolvedValue(opts.session);
  auth.api.getActiveMember = vi.fn().mockResolvedValue(opts.member);
};

describe('req 3 — roleAtLeast orders the three roles', () => {
  it('a member does not satisfy admin', async () => {
    const { roleAtLeast } = await import('@/lib/auth/roles');
    expect(
      roleAtLeast('member', 'admin'),
      'A member must not satisfy the admin gate. Check ROLE_RANK orders member below admin and roleAtLeast compares the ranks.',
    ).toBe(false);
  });

  it('an admin satisfies admin but not owner', async () => {
    const { roleAtLeast } = await import('@/lib/auth/roles');
    expect(
      roleAtLeast('admin', 'admin'),
      'An admin must satisfy the admin gate (>= is inclusive). Check roleAtLeast uses >= on ROLE_RANK.',
    ).toBe(true);
    expect(
      roleAtLeast('admin', 'owner'),
      'An admin must not satisfy the owner gate. Check ROLE_RANK ranks owner above admin.',
    ).toBe(false);
  });

  it('an owner satisfies every role', async () => {
    const { roleAtLeast } = await import('@/lib/auth/roles');
    expect(
      roleAtLeast('owner', 'owner') &&
        roleAtLeast('owner', 'admin') &&
        roleAtLeast('owner', 'member'),
      'An owner must satisfy owner, admin, and member gates. Check owner is the top rank in ROLE_RANK.',
    ).toBe(true);
  });
});

describe('req 4 — requireOrgUser resolves or redirects the active-org context', () => {
  it('returns { user, orgId, role } for a member of the active org', async () => {
    const mod = await loadAuth();
    stubAuth(mod.auth as never, {
      session: {
        user: { id: 'user-alice', email: 'alice@acme.test', name: 'Alice' },
        session: { activeOrganizationId: 'org-acme' },
      },
      member: { role: 'owner' },
    });

    const result = await mod.requireOrgUser();

    expect(
      result.orgId,
      'requireOrgUser must take orgId from the validated session (session.activeOrganizationId), not return an empty placeholder.',
    ).toBe('org-acme');
    expect(
      result.role,
      'requireOrgUser must read the role fresh from getActiveMember, not hard-code it. Expected the membership role "owner".',
    ).toBe('owner');
    expect(
      result.user.id,
      'requireOrgUser must return the signed-in user from the session.',
    ).toBe('user-alice');
  });

  it('redirects to /onboarding/create-org when no active org is set', async () => {
    const mod = await loadAuth();
    stubAuth(mod.auth as never, {
      session: {
        user: { id: 'user-bob', email: 'bob@acme.test', name: 'Bob' },
        session: { activeOrganizationId: null },
      },
      member: { role: 'member' },
    });

    let target: string | null = null;
    let returned = false;
    try {
      await mod.requireOrgUser();
      returned = true;
    } catch (e) {
      target = redirectTarget(e);
    }

    expect(
      returned,
      'requireOrgUser must redirect (not return) when the session carries no activeOrganizationId.',
    ).toBe(false);
    expect(
      target,
      'With no active org, requireOrgUser must redirect to /onboarding/create-org.',
    ).toBe('/onboarding/create-org');
  });

  it('redirects to /onboarding/create-org when getActiveMember finds no membership', async () => {
    const mod = await loadAuth();
    stubAuth(mod.auth as never, {
      session: {
        user: { id: 'user-carol', email: 'carol@acme.test', name: 'Carol' },
        session: { activeOrganizationId: 'org-acme' },
      },
      member: null,
    });

    let target: string | null = null;
    let returned = false;
    try {
      await mod.requireOrgUser();
      returned = true;
    } catch (e) {
      target = redirectTarget(e);
    }

    expect(
      returned,
      'requireOrgUser must redirect (not return) when getActiveMember returns no membership for the active org.',
    ).toBe(false);
    expect(
      target,
      'With an active org but no membership row, requireOrgUser must redirect to /onboarding/create-org — the role must come from a fresh getActiveMember read.',
    ).toBe('/onboarding/create-org');
  });
});

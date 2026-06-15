import { pathToFileURL } from 'node:url';

import { hashPassword } from 'better-auth/crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { planEntitlements } from '@/db/schema';
import { account, member, organization, user } from '@/db/schema/auth';

// The deterministic Playwright seed. One org (`e2e-org`), one verified admin
// (admin@e2e.test, password = E2E_ADMIN_PASSWORD) the auth.setup.ts signs in as, one
// member, and a `free` plan_entitlements row (stripeCustomerId stays null — the upgrade
// action lazily creates the Customer on first Checkout). Fixed ids, direct inserts
// (drizzle-seed cannot seed the constraint-heavy tables). Better Auth plugin-table
// inserts supply text id + createdAt explicitly.
//
// Imports better-auth/crypto's hashPassword (server-only-free) — never @/lib/auth, whose
// server-only import throws outside Next — so the seeded credential is sign-in-able with
// the scrypt format the app verifies.

const NOW = new Date('2026-01-01T00:00:00.000Z');

const ORG = { id: 'e2e-org', name: 'E2E Org', slug: 'e2e-org' } as const;
const ADMIN = {
  id: 'user_e2e_admin',
  name: 'E2E Admin',
  email: 'admin@e2e.test',
} as const;
const MEMBER = {
  id: 'user_e2e_member',
  name: 'E2E Member',
  email: 'member@e2e.test',
} as const;

export const runSeedE2e = async (): Promise<void> => {
  const url = process.env.DATABASE_URL_E2E;
  if (!url) {
    throw new Error(
      'DATABASE_URL_E2E is not set (run via dotenv -e .env.test)',
    );
  }
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      'E2E_ADMIN_PASSWORD is not set (copy .env.test.local.example to .env.test.local)',
    );
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { casing: 'snake_case' });
  const passwordHash = await hashPassword(password);

  try {
    // Truncate the seeded tables (idempotent reseed). CASCADE clears dependent rows.
    await client.unsafe(
      'truncate table plan_entitlements, member, account, "session", "user", organization restart identity cascade',
    );

    await db.insert(organization).values({
      id: ORG.id,
      name: ORG.name,
      slug: ORG.slug,
      createdAt: NOW,
    });

    await db.insert(user).values(
      [ADMIN, MEMBER].map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: true,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    );

    await db.insert(account).values(
      [ADMIN, MEMBER].map((u) => ({
        id: `account_${u.id}`,
        accountId: u.id,
        providerId: 'credential',
        userId: u.id,
        password: passwordHash,
        createdAt: NOW,
        updatedAt: NOW,
      })),
    );

    await db.insert(member).values([
      {
        id: 'member_e2e_admin',
        organizationId: ORG.id,
        userId: ADMIN.id,
        role: 'admin',
        createdAt: NOW,
      },
      {
        id: 'member_e2e_member',
        organizationId: ORG.id,
        userId: MEMBER.id,
        role: 'member',
        createdAt: NOW,
      },
    ]);

    // One `free` row (stripeCustomerId on the org stays null).
    await db.insert(planEntitlements).values({ organizationId: ORG.id });

    console.info(
      '[seed-e2e] seeded e2e-org + admin@e2e.test + member@e2e.test',
    );
  } finally {
    await client.end();
  }
};

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runSeedE2e()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

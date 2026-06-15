import { pathToFileURL } from 'node:url';

import { reset } from 'drizzle-seed';

import { dbUnpooled } from '@/db/index';
import type {
  NewCustomer,
  NewInvoice,
  NewInvoiceLine,
  NewOrgMember,
} from '@/db/schema';
import * as schema from '@/db/schema';
import { env } from '@/env';

type InvoiceStatus = (typeof schema.invoiceStatus.enumValues)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_COUNT = 40;
const SEED_EPOCH = Date.UTC(2025, 0, 1);

const ORG_SEEDS = [
  { name: 'Acme Corporation', slug: 'acme' },
  { name: 'Globex Industries', slug: 'globex' },
] as const;

const USER_SEEDS = [
  { name: 'Ada Lovelace', email: 'ada@acme.test' },
  { name: 'Grace Hopper', email: 'grace@acme.test' },
  { name: 'Alan Turing', email: 'alan@globex.test' },
  { name: 'Edsger Dijkstra', email: 'edsger@globex.test' },
] as const;

const STATUS_BANDS: readonly { status: InvoiceStatus; weight: number }[] = [
  { status: 'paid', weight: 50 },
  { status: 'sent', weight: 25 },
  { status: 'draft', weight: 15 },
  { status: 'overdue', weight: 10 },
];

// A small linear-congruential PRNG seeded by env.SEED so every run is
// byte-identical. reset()-then-insert makes the seed idempotent; the fixed seed
// makes it deterministic — re-running yields the same rows and the same counts.
const createPrng = (seed: number) => {
  let state = seed >>> 0 || 1;
  const nextFloat = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x80000000;
  };
  return {
    int: (min: number, max: number) =>
      min + Math.floor(nextFloat() * (max - min + 1)),
    money: (min: number, max: number) =>
      (min + nextFloat() * (max - min)).toFixed(2),
    pick: <T>(items: readonly T[]): T => {
      const item = items[Math.floor(nextFloat() * items.length)];
      if (item === undefined) {
        throw new Error('seed: cannot pick from an empty list');
      }
      return item;
    },
    weightedStatus: (): InvoiceStatus => {
      const total = STATUS_BANDS.reduce((sum, band) => sum + band.weight, 0);
      let roll = nextFloat() * total;
      let chosen: InvoiceStatus = 'paid';
      for (const band of STATUS_BANDS) {
        roll -= band.weight;
        if (roll < 0) {
          chosen = band.status;
          break;
        }
      }
      return chosen;
    },
  };
};

export const runSeed = async (): Promise<void> => {
  const prng = createPrng(env.SEED);

  await reset(dbUnpooled, schema);

  const [acme, globex] = await dbUnpooled
    .insert(schema.organizations)
    .values(ORG_SEEDS.map((org) => ({ name: org.name, slug: org.slug })))
    .returning({ id: schema.organizations.id });
  if (!acme || !globex) {
    throw new Error('seed: expected two organizations');
  }

  const [ada, grace, alan, edsger] = await dbUnpooled
    .insert(schema.users)
    .values(USER_SEEDS.map((user) => ({ name: user.name, email: user.email })))
    .returning({ id: schema.users.id });
  if (!ada || !grace || !alan || !edsger) {
    throw new Error('seed: expected four users');
  }

  // Ada belongs to BOTH orgs (overlapping membership); the rest split per org.
  const orgMemberRows: NewOrgMember[] = [
    { organizationId: acme.id, userId: ada.id, role: 'owner' },
    { organizationId: globex.id, userId: ada.id, role: 'admin' },
    { organizationId: acme.id, userId: grace.id, role: 'member' },
    { organizationId: globex.id, userId: alan.id, role: 'owner' },
    { organizationId: globex.id, userId: edsger.id, role: 'member' },
  ];
  await dbUnpooled.insert(schema.orgMembers).values(orgMemberRows);

  const acmeUserIds = [ada.id, grace.id];
  const globexUserIds = [ada.id, alan.id, edsger.id];

  const customerRows: NewCustomer[] = Array.from(
    { length: CUSTOMER_COUNT },
    (_, i) => {
      const org = i % 2 === 0 ? acme : globex;
      const slug = i % 2 === 0 ? 'acme' : 'globex';
      return {
        organizationId: org.id,
        name: `Customer ${i + 1}`,
        email: `customer${i + 1}@${slug}.test`,
      };
    },
  );
  const customers = await dbUnpooled
    .insert(schema.customers)
    .values(customerRows)
    .returning({
      id: schema.customers.id,
      organizationId: schema.customers.organizationId,
    });

  let invoiceNumber = 0;
  const invoiceRows: NewInvoice[] = [];
  const lineCounts: number[] = [];
  for (const customer of customers) {
    const userIds =
      customer.organizationId === acme.id ? acmeUserIds : globexUserIds;
    const invoiceCount = prng.int(12, 18);
    for (let i = 0; i < invoiceCount; i += 1) {
      invoiceNumber += 1;
      const issuedAt = new Date(SEED_EPOCH + prng.int(0, 364) * DAY_MS);
      invoiceRows.push({
        organizationId: customer.organizationId,
        customerId: customer.id,
        createdBy: prng.pick(userIds),
        number: `INV-${String(invoiceNumber).padStart(5, '0')}`,
        status: prng.weightedStatus(),
        total: prng.money(50, 5000),
        currency: 'USD',
        issuedAt,
        dueAt: new Date(issuedAt.getTime() + 30 * DAY_MS),
      });
      lineCounts.push(prng.int(2, 4));
    }
  }

  const invoices = await dbUnpooled
    .insert(schema.invoices)
    .values(invoiceRows)
    .returning({ id: schema.invoices.id });

  const lineRows: NewInvoiceLine[] = invoices.flatMap((invoice, index) => {
    const lineCount = lineCounts[index];
    if (lineCount === undefined) {
      return [];
    }
    return Array.from({ length: lineCount }, (_, i) => {
      const position = i + 1;
      return {
        invoiceId: invoice.id,
        description: `Line item ${position}`,
        quantity: prng.money(1, 10),
        unitPrice: prng.money(20, 500),
        position,
      };
    });
  });
  await dbUnpooled.insert(schema.invoiceLines).values(lineRows);
};

// Run as a CLI: pathToFileURL normalizes the entry path so the guard fires even
// when the project path contains a space (import.meta.url percent-encodes it
// while process.argv[1] keeps it literal — a naive compare would silently skip).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  runSeed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

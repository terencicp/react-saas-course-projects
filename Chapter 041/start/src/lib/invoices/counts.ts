import { count } from 'drizzle-orm';

import { db } from '@/db/index';
import {
  customers,
  invoiceLines,
  invoices,
  organizations,
  orgMembers,
  users,
} from '@/db/schema';

// Provided plumbing for the inspector's verification banner: six count(*) reads,
// one per table. Uses db.select (the aggregate) rather than the relational API.
export const getRowCounts = async (): Promise<{
  organizations: number;
  users: number;
  orgMembers: number;
  customers: number;
  invoices: number;
  invoiceLines: number;
}> => {
  const [[orgs], [usrs], [members], [custs], [invs], [lines]] =
    await Promise.all([
      db.select({ n: count() }).from(organizations),
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(orgMembers),
      db.select({ n: count() }).from(customers),
      db.select({ n: count() }).from(invoices),
      db.select({ n: count() }).from(invoiceLines),
    ]);

  return {
    organizations: orgs?.n ?? 0,
    users: usrs?.n ?? 0,
    orgMembers: members?.n ?? 0,
    customers: custs?.n ?? 0,
    invoices: invs?.n ?? 0,
    invoiceLines: lines?.n ?? 0,
  };
};

// Provided helper for the inspector's org switcher: the seeded orgs as {id, name}.
export const listOrgs = async (): Promise<{ id: string; name: string }[]> =>
  db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(organizations.name);

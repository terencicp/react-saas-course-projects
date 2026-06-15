import { sql } from 'drizzle-orm';
import { authenticatedRole } from 'drizzle-orm/neon';
import {
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

import { organization, user } from '@/db/schema/auth';

// The append-only audit table. No updatedAt/deletedAt — the absent lifecycle
// columns are the append-only tell, and the deny-UPDATE/DELETE RLS policies make
// the immutability the database's job, not the app's.
//
// organizationId / actorUserId are `text` (not uuid): Better Auth generates
// organization.id / user.id as base62 text ids, so a uuid FK→text emits DDL
// Postgres rejects ("incompatible types: uuid and text"). Only the standalone id
// PK (no incoming FK) stays uuid.
//
// The org-isolation predicate compares organization_id (text) to
// current_setting('app.org_id', true); the `, true` makes a missing setting NULL
// → policy false → fail-closed (not a 500). No ::uuid cast — both sides are text.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid()
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    organizationId: text()
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorUserId: text().references(() => user.id, { onDelete: 'set null' }),
    actorIp: text(),
    actorUserAgent: text(),
    action: text().notNull(),
    subjectType: text().notNull(),
    subjectId: text().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_audit_logs_org_created').on(
      t.organizationId,
      t.createdAt.desc(),
    ),
    index('idx_audit_logs_org_actor_created').on(
      t.organizationId,
      t.actorUserId,
      t.createdAt.desc(),
    ),
    pgPolicy('audit_logs_org_isolation', {
      as: 'permissive',
      for: 'all',
      to: authenticatedRole,
      using: sql`${t.organizationId} = current_setting('app.org_id', true)`,
      withCheck: sql`${t.organizationId} = current_setting('app.org_id', true)`,
    }),
    pgPolicy('audit_logs_no_update', {
      as: 'restrictive',
      for: 'update',
      to: authenticatedRole,
      using: sql`false`,
    }),
    pgPolicy('audit_logs_no_delete', {
      as: 'restrictive',
      for: 'delete',
      to: authenticatedRole,
      using: sql`false`,
    }),
  ],
).enableRLS();

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

// The caller-supplied half of an audit row: the actor/org context is derived by
// logAudit from requireOrgUser + headers, so the event carries only the what.
export type AuditEvent = {
  action: string;
  subjectType?: string;
  subjectId?: string;
  payload?: Record<string, unknown>;
};

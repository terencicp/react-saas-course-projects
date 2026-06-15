import { sql } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { Suspense } from 'react';

import { ACTING_USER_COOKIE } from '@/app/(protected)/inspector/constants';
import { Card } from '@/components/ui/card';
import { db } from '@/db';
import { requireOrgUser } from '@/lib/auth';

// The production inbox read. It resolves `userId` from the session (or, in dev, the
// inspector's acting identity) — NEVER an orgId from a query string — so a hand-crafted
// cross-tenant URL cannot leak another user's notifications. The list is one bounded
// region; each row is one bounded element carrying data-unread, so a Rendered check
// asserts read/unread deterministically. No caching: this re-renders via
// revalidatePath / router.refresh only, never a tag-based invalidation.

const isDev = process.env.NODE_ENV !== 'production';

type InboxRow = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
};

// Resolve the user the inbox renders as: the session identity in production, the dev
// acting-user cookie override in development (mirrors the inspector's read path).
const resolveUserId = async (): Promise<string> => {
  const session = await requireOrgUser();
  if (!isDev) {
    return session.user.id;
  }
  const jar = await cookies();
  return jar.get(ACTING_USER_COOKIE)?.value ?? session.user.id;
};

// Read the active user's last 20 notifications, newest first. Guarded so a scaffold
// where the `notifications` table does not yet exist renders empty instead of 500-ing
// (the table lands with the student's S1 migration). Once the table exists this is a
// plain ordered read with no joins (render-at-dispatch froze title/body onto the row).
const readInbox = async (userId: string): Promise<InboxRow[]> => {
  try {
    const result = await db.execute<InboxRow>(sql`
      select id, event_type as "eventType", title, body,
             created_at as "createdAt", read_at as "readAt"
      from notifications
      where user_id = ${userId}
      order by created_at desc
      limit 20
    `);
    return [...result];
  } catch {
    return [];
  }
};

const InboxList = async () => {
  const userId = await resolveUserId();
  const rows = await readInbox(userId);

  if (rows.length === 0) {
    return (
      <Card data-testid="inbox-page-empty" className="p-6">
        <p className="text-sm text-muted-foreground">
          No notifications yet. Fire an event from the inspector to populate
          this inbox.
        </p>
      </Card>
    );
  }

  return (
    <ul data-testid="inbox-page-list" className="flex flex-col gap-3">
      {rows.map((row) => (
        <li
          key={row.id}
          data-testid="inbox-page-row"
          data-unread={row.readAt === null ? 'true' : 'false'}
        >
          <Card className="flex flex-col gap-1 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{row.title}</span>
              {row.readAt === null && (
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                  Unread
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{row.body}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {row.eventType} · {new Date(row.createdAt).toISOString()}
            </p>
          </Card>
        </li>
      ))}
    </ul>
  );
};

const InboxPage = () => (
  <section
    data-testid="inbox-page"
    className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10"
  >
    <h1 className="text-2xl font-semibold">Inbox</h1>
    <Suspense>
      <InboxList />
    </Suspense>
  </section>
);

export default InboxPage;

import { sql } from 'drizzle-orm';
import { connection } from 'next/server';

import { dbUnpooled } from '@/db';

// The launch-checklist health endpoint the uptime monitor hits: unauthenticated,
// cheap, opaque body — never a connection string or error detail.
//
// No route segment config exports: under cacheComponents both segment configs are
// a hard build error. Node is the default execution environment in Next 16. The
// segment-config-free opt-in for request-time data is `await connection()` before
// the DB read — the documented, intent-revealing way to mark a handler per-request.
export const GET = async (): Promise<Response> => {
  await connection();

  try {
    await dbUnpooled.execute(sql`select 1`);
    return Response.json({ ok: true, db: 'up' }, { status: 200 });
  } catch {
    return Response.json({ ok: false, db: 'down' }, { status: 503 });
  }
};

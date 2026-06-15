import { sql } from 'drizzle-orm';

import { db } from '@/db/index';

// Provided plan probes — the student's job is to read the output, not write
// EXPLAIN. Each probe runs `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)` over the
// same shape the student's query produces (org-scoped, with the joins) and
// returns the plan text joined into one string for the plan panel to render.

type PlanRow = { 'QUERY PLAN': string };

const planText = (rows: readonly PlanRow[]): string =>
  rows.map((row) => row['QUERY PLAN']).join('\n');

export const getDetailPlan = async ({
  organizationId,
  invoiceId,
}: {
  organizationId: string;
  invoiceId: string;
}): Promise<string> => {
  const rows = await db.execute<PlanRow>(sql`
    explain (analyze, buffers, format text)
    select i.*,
           row_to_json(c.*) as customer,
           coalesce(
             (
               select json_agg(l.* order by l.position)
               from invoice_lines l
               where l.invoice_id = i.id
             ),
             '[]'::json
           ) as lines
    from invoices i
    join customers c on c.id = i.customer_id
    where i.id = ${invoiceId}
      and i.organization_id = ${organizationId}
    limit 1
  `);

  return planText(rows as unknown as PlanRow[]);
};

export const getListPlan = async ({
  organizationId,
  status,
}: {
  organizationId: string;
  status?: string;
}): Promise<string> => {
  const statusFilter = status
    ? sql`and i.status = ${status}::invoice_status`
    : sql``;

  const rows = await db.execute<PlanRow>(sql`
    explain (analyze, buffers, format text)
    select i.*, row_to_json(c.*) as customer
    from invoices i
    join customers c on c.id = i.customer_id
    where i.organization_id = ${organizationId}
    ${statusFilter}
    order by i.created_at desc, i.id desc
    limit 21
  `);

  return planText(rows as unknown as PlanRow[]);
};

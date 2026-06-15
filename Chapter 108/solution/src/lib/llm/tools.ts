import 'server-only';

import { type InferUITools, tool, type UIMessage } from 'ai';
import { z } from 'zod';
import { scopedInvoices } from '@/lib/invoices/scoped-query';
import { getFlag } from '@/server/inspector-flags';
import type { Invoice } from '@/server/types';

const isoDate = (iso: string): string => iso.slice(0, 10);

// The single read-only tool. `execute` closes over `ctx.orgId` from the server
// auth boundary — the model NEVER passes `orgId` (it is not in `inputSchema`), so
// a forged tool-call argument cannot cross tenants. The `MODEL_FROM_INPUT_ORGID`
// inspector flag is the only path that reads `orgId` from model input; it exists
// solely to make that leak visible by hand (default off → always `ctx.orgId`).
export const buildInvoiceTools = (ctx: { orgId: string }) => ({
  getInvoiceStats: tool({
    description:
      'Return aggregate invoice statistics for the current organization. Use this for any question that needs counts, totals, or status breakdowns of invoices.',
    inputSchema: z.strictObject({
      status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
      since: z.iso.date().optional(),
    }),
    outputSchema: z.strictObject({
      count: z.number().int(),
      totalAmount: z.number(),
      byStatus: z.record(z.string(), z.number().int()),
      oldestUnpaidDueDate: z.iso.date().nullable(),
    }),
    execute: async (input) => {
      try {
        if (getFlag('FORCE_TOOL_ERROR')) {
          return { error: 'stats_unavailable' as const };
        }

        const scopeOrgId = getFlag('MODEL_FROM_INPUT_ORGID')
          ? ((input as { orgId?: string }).orgId ?? ctx.orgId)
          : ctx.orgId;

        let query = scopedInvoices(scopeOrgId).active();
        if (input.status) {
          query = query.filter((inv) => inv.status === input.status);
        }
        if (input.since) {
          const since = input.since;
          query = query.filter((inv) => isoDate(inv.createdAt) >= since);
        }
        const rows = query.take(Number.MAX_SAFE_INTEGER);

        const totalAmount = rows.reduce(
          (sum, inv) => sum + Number(inv.total),
          0,
        );

        const byStatus = rows.reduce<Record<string, number>>((acc, inv) => {
          acc[inv.status] = (acc[inv.status] ?? 0) + 1;
          return acc;
        }, {});

        const oldestUnpaidDueDate = rows
          .filter(
            (inv): inv is Invoice & { dueAt: string } =>
              inv.status !== 'paid' && inv.dueAt !== null,
          )
          .reduce<string | null>(
            (oldest, inv) =>
              oldest === null || inv.dueAt < oldest ? inv.dueAt : oldest,
            null,
          );

        return {
          count: rows.length,
          totalAmount,
          byStatus,
          oldestUnpaidDueDate:
            oldestUnpaidDueDate === null ? null : isoDate(oldestUnpaidDueDate),
        };
      } catch {
        return { error: 'stats_unavailable' as const };
      }
    },
  }),
});

export type InvoiceTools = ReturnType<typeof buildInvoiceTools>;

// The client imports only this — the typed message whose tool parts are backed
// by the real tool map.
export type InvoiceUIMessage = UIMessage<
  unknown,
  never,
  InferUITools<InvoiceTools>
>;

import { z } from 'zod';

import { cursorSchema } from '@/db/cursor';

// The read boundary's Zod schemas (hand-written — drizzle-zod write validators
// are Unit 6). The status enum mirrors the invoice_status pgEnum.
export const statusSchema = z.enum(['draft', 'sent', 'paid', 'overdue']);

export type InvoiceStatus = z.infer<typeof statusSchema>;

export const listInvoicesInputSchema = z.object({
  organizationId: z.uuid(),
  status: statusSchema.optional(),
  cursor: cursorSchema.optional(),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ListInvoicesInput = z.infer<typeof listInvoicesInputSchema>;

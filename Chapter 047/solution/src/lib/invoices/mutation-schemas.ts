import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { invoices } from '@/db/schema';

export const createInvoiceInputSchema = createInsertSchema(invoices, {
  number: (s) => s.min(1).max(50),
  total: (s) =>
    s
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount (max 2 decimals)')
      .refine((v) => Number(v) >= 0, 'Total must be non-negative'),
  customerId: z.uuid(),
  issuedAt: z.coerce.date('Enter a valid date'),
  dueAt: z.coerce.date('Enter a valid date'),
}).omit({ organizationId: true, createdBy: true, createdAt: true });

export type CreateInvoiceInput = z.input<typeof createInvoiceInputSchema>;
export type CreateInvoiceOutput = z.output<typeof createInvoiceInputSchema>;

export const updateInvoiceInputSchema = createInvoiceInputSchema.extend({
  id: z.uuid(),
});

export type UpdateInvoiceInput = z.input<typeof updateInvoiceInputSchema>;
export type UpdateInvoiceOutput = z.output<typeof updateInvoiceInputSchema>;

export const deleteInvoiceInputSchema = z.object({ id: z.uuid() });

export type DeleteInvoiceInput = z.input<typeof deleteInvoiceInputSchema>;
export type DeleteInvoiceOutput = z.output<typeof deleteInvoiceInputSchema>;

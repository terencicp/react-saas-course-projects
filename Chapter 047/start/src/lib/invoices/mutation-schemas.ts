import { z } from 'zod';

// TODO(L2) — createInvoiceInputSchema: createInsertSchema(invoices, { number, total overrides }).omit({ organizationId, createdBy, createdAt }); keep id optional; total stays a string (callback regex+refine — numeric column is a string on insert); coerce issuedAt/dueAt to date, customerId uuid.
export const createInvoiceInputSchema = z.object({});

export type CreateInvoiceInput = z.input<typeof createInvoiceInputSchema>;
export type CreateInvoiceOutput = z.output<typeof createInvoiceInputSchema>;

// TODO(L3) — updateInvoiceInputSchema = createInvoiceInputSchema.extend({ id: z.uuid() }).
export const updateInvoiceInputSchema = z.object({});

export type UpdateInvoiceInput = z.input<typeof updateInvoiceInputSchema>;
export type UpdateInvoiceOutput = z.output<typeof updateInvoiceInputSchema>;

// TODO(L4) — deleteInvoiceInputSchema = z.object({ id: z.uuid() }).
export const deleteInvoiceInputSchema = z.object({});

export type DeleteInvoiceInput = z.input<typeof deleteInvoiceInputSchema>;
export type DeleteInvoiceOutput = z.output<typeof deleteInvoiceInputSchema>;

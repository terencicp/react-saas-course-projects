import { z } from 'zod';

export const statusSchema = z.enum(['draft', 'sent', 'paid', 'overdue']);

export type InvoiceStatus = z.infer<typeof statusSchema>;

export const searchParamsSchema = z.object({
  status: statusSchema.optional(),
});

export type Invoice = {
  id: string;
  number: string;
  customer: string;
  status: InvoiceStatus;
  amount: number;
  dueDate: string;
};

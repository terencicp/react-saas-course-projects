import { invoices } from '@/lib/invoices/data';
import type { Invoice, InvoiceStatus } from '@/lib/invoices/schema';

export const listInvoices = async (filters: {
  status?: InvoiceStatus;
}): Promise<Invoice[]> => {
  const matched = filters.status
    ? invoices.filter((invoice) => invoice.status === filters.status)
    : invoices;

  return [...matched].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
};

export const getInvoice = async (id: string): Promise<Invoice | null> => {
  // Intentional streaming seam: the artificial delay makes the @detail slot
  // visibly stream behind its own Suspense boundary (Lesson 4).
  await new Promise((resolve) => setTimeout(resolve, 600));

  return invoices.find((invoice) => invoice.id === id) ?? null;
};

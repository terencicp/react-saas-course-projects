import 'server-only';

import type { Invoice } from '@/db/schema';

// Pure projection: invoice rows → an RFC-4180 CSV string. No DB, no SDK — the child
// task calls this on each page's rows and the parent concatenates the pages. The
// in-memory accumulation is bounded by the per-org row cap; the streaming alternative
// (write each page to an object-storage multipart upload instead of holding the whole
// CSV) lands in Chapter 069's object-storage upload.

const COLUMNS = [
  'id',
  'number',
  'customerName',
  'status',
  'total',
  'currency',
  'createdAt',
  'dueAt',
] as const;

// RFC-4180 field quoting: wrap in double quotes when the value contains a comma,
// quote, CR, or LF, and double any embedded quotes. null/undefined render empty.
const quoteField = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  const str = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const toRow = (invoice: Invoice): string =>
  COLUMNS.map((column) => quoteField(invoice[column])).join(',');

// CRLF line endings per RFC-4180. Header row first, then one line per invoice.
export const rowsToCsv = (rows: Invoice[]): string => {
  const header = COLUMNS.join(',');
  const lines = rows.map(toRow);
  return [header, ...lines].join('\r\n');
};

import type { ListParsed } from '@/lib/invoices/queries';

// TODO(L2) — define the five parsers + searchParamsCache.
//
// Replace these placeholders with the real `nuqs` parser map (status, sort, q,
// view, cursor) and a `createSearchParamsCache` over it, so the URL becomes the
// source of truth for the list view-state. `invoiceListSearchParams` is the
// parser map every later slice reads; `invoiceListSearchParamsCache.parse(
// searchParams)` yields the settled `ListParsed` the page threads into the
// toolbar, chips, and view tabs.

export const invoiceListSearchParams = {};

const DEFAULT_PARSED: ListParsed = {
  status: null,
  sort: '-createdAt',
  view: 'active',
  q: '',
  cursor: null,
};

export const invoiceListSearchParamsCache = {
  parse: (_searchParams: unknown): ListParsed => DEFAULT_PARSED,
};

import {
  createSearchParamsCache,
  parseAsString,
  parseAsStringEnum,
} from 'nuqs/server';

export const invoiceListSearchParams = {
  status: parseAsStringEnum(['draft', 'sent', 'paid', 'overdue']),
  sort: parseAsStringEnum([
    '-createdAt',
    'createdAt',
    '-total',
    'total',
    '-customer',
    'customer',
  ]).withDefault('-createdAt'),
  q: parseAsString.withDefault(''),
  view: parseAsStringEnum(['active', 'archived', 'all']).withDefault('active'),
  cursor: parseAsString,
};

export const invoiceListSearchParamsCache = createSearchParamsCache(
  invoiceListSearchParams,
);

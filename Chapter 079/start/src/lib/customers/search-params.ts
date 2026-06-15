import { createSearchParamsCache, parseAsString } from 'nuqs/server';

// The list URL state: a free-text search and a keyset cursor. Shared between the
// page's server-side cache and the client toolbar/pagination so the parsers
// stay in one place.
export const customerListSearchParams = {
  q: parseAsString.withDefault(''),
  cursor: parseAsString,
};

export const customerListSearchParamsCache = createSearchParamsCache(
  customerListSearchParams,
);

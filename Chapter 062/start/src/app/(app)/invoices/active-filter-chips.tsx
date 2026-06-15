import type { ListParsed } from '@/lib/invoices/queries';

// TODO(L2) — render a chip per non-default filter.
//
// Read `parsed` and emit one chip per active filter (status, search, non-default
// sort); each chip's clear "x" is a tiny `'use client'` setter that strips its
// param and bundles `cursor: null`. For now this renders nothing.
export const ActiveFilterChips = (_props: { parsed: ListParsed }) => null;

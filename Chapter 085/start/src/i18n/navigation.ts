import { createNavigation } from 'next-intl/navigation';
import { routing } from '@/i18n/routing';

// Locale-aware drop-in replacements for Next's navigation primitives. Built from
// the same `routing` the proxy uses, so a `<Link href="/invoices">` rendered at
// `/fr-FR` resolves to `/fr-FR/invoices` automatically — never hand-prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

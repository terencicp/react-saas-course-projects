import {
  Bell,
  Building2,
  CreditCard,
  FileText,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, Suspense } from 'react';

import { signOutAction } from '@/app/(protected)/sign-out-action';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth';

// SEEDED AUDIT DEFECT #6 (finding 6, L6) — barrel import of `lucide-react` (094
// L3/L4): the nav above imports ~a dozen icons via the `lucide-react` BARREL, and
// next.config.ts does NOT list `lucide-react` under
// `experimental.optimizePackageImports` — so the whole icon set is pulled into every
// authenticated page's bundle (~570 KB extra). The documented + applied fix (slice
// S5) is the single `optimizePackageImports` line; per-icon imports are the partial.
// lucide 1.x dropped brand icons, so only non-brand glyphs are used.
const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/invoices', label: 'Invoices', Icon: FileText },
  { href: '/settings', label: 'Settings', Icon: Settings },
] as const;

const AppNav = async () => {
  // The layout's own request-time read must sit under <Suspense> — a co-located
  // loading.tsx covers the children, not the layout body.
  const user = await requireUser('/dashboard');

  return (
    <nav
      data-testid="app-nav"
      className="flex items-center justify-between gap-4 border-b px-6 py-4"
    >
      <div className="flex items-center gap-4">
        <Building2 className="size-5" aria-hidden />
        <ul className="flex items-center gap-4 text-sm">
          {NAV_LINKS.map(({ href, label, Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center gap-3">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <Bell className="size-4 text-muted-foreground" aria-hidden />
        <HelpCircle className="size-4 text-muted-foreground" aria-hidden />
        <CreditCard className="size-4 text-muted-foreground" aria-hidden />
        <Home className="size-4 text-muted-foreground" aria-hidden />
        <Users className="size-4 text-muted-foreground" aria-hidden />
        <span data-testid="nav-user-email" className="text-sm font-medium">
          {user.email}
        </span>
        <form action={signOutAction}>
          <Button type="submit" variant="outline" data-testid="sign-out-button">
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Button>
        </form>
      </div>
    </nav>
  );
};

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <Suspense>
        <AppNav />
      </Suspense>
      <main>{children}</main>
    </>
  );
}

import { type ReactNode, Suspense } from 'react';

import { signOutAction } from '@/app/(protected)/sign-out-action';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth';

const AppNav = async () => {
  // The layout's own request-time read must sit under <Suspense> — a co-located
  // loading.tsx covers the children, not the layout body.
  const user = await requireUser('/dashboard');

  return (
    <nav
      data-testid="app-nav"
      className="flex items-center justify-between border-b px-6 py-4"
    >
      <span data-testid="nav-user-email" className="text-sm font-medium">
        {user.email}
      </span>
      <form action={signOutAction}>
        <Button type="submit" variant="outline" data-testid="sign-out-button">
          Sign out
        </Button>
      </form>
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

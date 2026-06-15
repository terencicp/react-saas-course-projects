import type { ReactNode } from 'react';

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  /* TODO(L5) — requireUser(), nav with email + sign-out form */
  return <>{children}</>;
}

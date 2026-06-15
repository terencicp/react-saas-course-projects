'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

type PollerProps = {
  // True while the entitlement is still `free` (the webhook has not landed). When the
  // server re-renders with a non-free plan the parent passes false and polling stops.
  finalizing: boolean;
};

// Read-and-poll: while the entitlement is finalizing, refresh the route every 2s so
// the Server Component re-reads the entitlement. router.refresh() re-runs the server
// render without a full navigation — the carried-in pattern from 063 L3. It never
// reads session_id and never writes; the webhook owns the write.
export const Poller = ({ finalizing }: PollerProps) => {
  const router = useRouter();

  useEffect(() => {
    if (!finalizing) {
      return;
    }
    const interval = setInterval(() => {
      router.refresh();
    }, 2000);
    return () => clearInterval(interval);
  }, [finalizing, router]);

  return null;
};

'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

// The JS-enhanced success toast. Success data flows through the URL (?deleted),
// so the SSR `deleted-banner` survives no-JS; this island is the enhancement on
// top — it fires the Sonner toast once when the param is present.
export const DeletedToast = ({ number }: { number: string }) => {
  useEffect(() => {
    toast.success(`Invoice ${number} deleted`, { id: `deleted-${number}` });
  }, [number]);

  return null;
};

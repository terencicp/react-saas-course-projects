'use client';

import { useState } from 'react';

import { sendResendTest } from '@/app/(protected)/settings/actions';
import { Button } from '@/components/ui/button';

// Secrets-safe resend test (082 finding 5, pre-fixed): this client component calls
// the `sendResendTest` Server Action — it never reads a Resend key (none ships to the
// client) and never fetches the Resend API from the browser. The key stays in the
// server partition behind src/lib/email.ts; the @t3-oss/env-nextjs split would make
// importing it here a build-time error.
export const ResendClientTest = () => {
  const [status, setStatus] = useState<string | null>(null);

  const onSend = async () => {
    setStatus('sending…');
    const result = await sendResendTest();
    setStatus(
      result.ok ? `sent: ${result.data.id}` : `error: ${result.error.code}`,
    );
  };

  return (
    <div data-testid="resend-client-test" className="rounded-md border p-4">
      <p className="text-sm font-medium">Resend server-action test</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Sends a test email through a Server Action — the key stays on the
        server.
      </p>
      <Button type="button" variant="outline" className="mt-3" onClick={onSend}>
        Send test email
      </Button>
      {status ? (
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      ) : null}
    </div>
  );
};

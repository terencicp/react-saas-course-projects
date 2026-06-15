'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { env } from '@/env';

// SEEDED AUDIT DEFECT #5 (finding 5) — secret in NEXT_PUBLIC_* (081 L6/L7):
// this CLIENT component reads `env.NEXT_PUBLIC_RESEND_API_KEY` and calls the Resend
// API directly from the browser. Because the var is NEXT_PUBLIC_*, the Resend secret
// is inlined into the client bundle and ships to every visitor; DevTools' network
// tab shows the request leaving the browser carrying the key in the Authorization
// header. The healthy shape is `RESEND_API_KEY` in the server partition + a Server
// Action that holds the key server-side. The request need not succeed (a 401 from a
// fake key is fine — the fingerprint is the key in the bundle + the request leaving
// the browser). The target ships the bug on purpose; do not "fix" it here.
export const ResendClientTest = () => {
  const [status, setStatus] = useState<string | null>(null);

  const sendFromBrowser = async () => {
    setStatus('sending…');
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          // SEEDED #5: the secret leaves the browser in plaintext.
          Authorization: `Bearer ${env.NEXT_PUBLIC_RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: 'test@example.com',
          to: 'test@example.com',
          subject: 'client-side test',
          text: 'sent from the browser',
        }),
      });
      setStatus(`response: ${res.status}`);
    } catch {
      setStatus('request failed');
    }
  };

  return (
    <div data-testid="resend-client-test" className="rounded-md border p-4">
      <p className="text-sm font-medium">Resend client test</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Sends a test email straight from the browser.
      </p>
      <Button
        type="button"
        variant="outline"
        className="mt-3"
        onClick={sendFromBrowser}
      >
        Send test email
      </Button>
      {status ? (
        <p className="mt-2 text-xs text-muted-foreground">{status}</p>
      ) : null}
    </div>
  );
};

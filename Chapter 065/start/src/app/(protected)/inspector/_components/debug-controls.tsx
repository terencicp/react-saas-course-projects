'use client';

import { useState, useTransition } from 'react';

import {
  forceEntitlementStatus,
  forceOlderEvent,
  forgeMetadata,
  missingHeader,
  replayLastEvent,
  tamperSignature,
} from '@/app/(protected)/inspector/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

// The dev-only forensic controls. The direct-write debug (force status) drives the
// deterministic gate-walk; the webhook debugs (tamper / missing header) POST forged
// bodies to the local route and surface its status+body in `webhook-response`; the
// CLI-shell debugs (replay / older / forge) are by-hand affordances that need
// `stripe listen` running. Every control carries a data-testid.
export const DebugControls = () => {
  const [pending, startTransition] = useTransition();
  const [webhookResponse, setWebhookResponse] = useState<{
    status: number;
    body: unknown;
  } | null>(null);

  const callWebhookDebug = (
    fn: () => Promise<
      | { ok: true; data: { status: number; body: unknown } }
      | { ok: false; error: { code: string; userMessage: string } }
    >,
  ) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        setWebhookResponse(result.data);
      }
    });
  };

  const forceStatus = (plan: string) => {
    startTransition(async () => {
      const form = new FormData();
      form.set('plan', plan);
      form.set('status', plan === 'free' ? 'active' : 'active');
      await forceEntitlementStatus(null, form);
    });
  };

  return (
    <Card data-testid="debug-controls" className="p-4">
      <h2 className="text-sm font-semibold">Debug controls (dev only)</h2>
      <Separator className="my-3" />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select disabled={pending} onValueChange={forceStatus}>
            <SelectTrigger data-testid="force-status-control" className="w-48">
              <SelectValue placeholder="Force entitlement…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">free</SelectItem>
              <SelectItem value="pro">pro</SelectItem>
              <SelectItem value="team">team</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            data-testid="tamper-signature"
            onClick={() => callWebhookDebug(tamperSignature)}
          >
            Tamper signature
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            data-testid="missing-header"
            onClick={() => callWebhookDebug(missingHeader)}
          >
            Missing header
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            data-testid="replay-last-event"
            onClick={() =>
              startTransition(() => replayLastEvent().then(() => {}))
            }
          >
            Replay last event
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            data-testid="force-older-event"
            onClick={() =>
              startTransition(() => forceOlderEvent().then(() => {}))
            }
          >
            Force older event
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            data-testid="forge-metadata"
            onClick={() =>
              startTransition(() => forgeMetadata().then(() => {}))
            }
          >
            Forge metadata
          </Button>
        </div>

        {webhookResponse && (
          <pre
            data-testid="webhook-response"
            className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs"
          >
            {`HTTP ${webhookResponse.status}\n${JSON.stringify(webhookResponse.body, null, 2)}`}
          </pre>
        )}
      </div>
    </Card>
  );
};

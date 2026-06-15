'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  forceRegistryMiss,
  resetAndReseed,
  setEmailFailing,
  wrapInviteInRollback,
} from '@/app/(protected)/inspector/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';

// The notification inspector's dev-only debug controls: force-registry-miss (proves the
// dispatcher throws REGISTRY_MISS on an unknown event), make-email-fail (toggles the
// mock's fail flag to prove channel independence), wrap-invite-rollback (the
// fire-after-commit affordance), and reset-reseed. Each carries a data-testid.
export const NotificationDebugControls = () => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [emailFailing, setEmailFailingState] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  };

  return (
    <Card data-testid="debug-controls" className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold">Debug controls (dev only)</h2>
      <Separator />

      <div className="flex flex-col gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="force-registry-miss"
          onClick={() =>
            run(async () => {
              const r = await forceRegistryMiss();
              if (r.ok) setNote(r.data.error);
            })
          }
        >
          Force registry miss
        </Button>

        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Make email fail</span>
          <Switch
            data-testid="make-email-fail"
            disabled={pending}
            checked={emailFailing}
            onCheckedChange={(v) => {
              setEmailFailingState(v);
              run(() => setEmailFailing(v));
            }}
          />
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="wrap-invite-rollback"
          onClick={() =>
            run(async () => {
              const r = await wrapInviteInRollback();
              if (r.ok) setNote(r.data.note);
            })
          }
        >
          Wrap invite in rollback
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          data-testid="reset-reseed"
          onClick={() => run(resetAndReseed)}
        >
          Reset + reseed
        </Button>

        {note && (
          <p className="font-mono text-xs text-muted-foreground">{note}</p>
        )}
      </div>
    </Card>
  );
};

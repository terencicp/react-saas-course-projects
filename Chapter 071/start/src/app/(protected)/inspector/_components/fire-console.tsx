'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { fireEvent, rapidFire } from '@/app/(protected)/inspector/actions';
import type { FireableType } from '@/app/(protected)/inspector/constants';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

type DispatchTriple = {
  sent: number;
  deduped: number;
  suppressedByPrefs: number;
};

type LastResult =
  | { kind: 'dispatch'; value: DispatchTriple }
  | { kind: 'error'; message: string }
  | null;

// The fire console: the three fire buttons + rapid-fire, and the transient
// dispatch-result panel. Each action `await dispatch(...)`s against the active user;
// the returned DispatchResult (or the thrown error string at scaffold) is shown here,
// then router.refresh() re-reads the server counters (email-sent-counter, dedup-badge).
export const FireConsole = () => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<LastResult>(null);

  const run = (
    fn: () => Promise<
      | { ok: true; data: { dispatch: DispatchTriple } | { error: string } }
      | { ok: false; error: { code: string; userMessage: string } }
    >,
  ) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        if ('dispatch' in result.data) {
          setLast({ kind: 'dispatch', value: result.data.dispatch });
        } else {
          setLast({ kind: 'error', message: result.data.error });
        }
      } else {
        setLast({ kind: 'error', message: result.error.userMessage });
      }
      router.refresh();
    });
  };

  const fire = (type: FireableType) => run(() => fireEvent(type));

  return (
    <Card data-testid="fire-console" className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold">Fire events</h2>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          data-testid="fire-invite-sent"
          onClick={() => fire('org.invitation.sent')}
        >
          Fire invite-sent
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          data-testid="fire-role-changed"
          onClick={() => fire('org.member.role_changed')}
        >
          Fire role-changed
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={pending}
          data-testid="fire-billing-past-due"
          onClick={() => fire('org.billing.past_due')}
        >
          Fire billing-past-due
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          data-testid="rapid-fire-invite-sent"
          onClick={() => run(() => rapidFire('org.invitation.sent'))}
        >
          Rapid-fire invite-sent ×5
        </Button>
      </div>

      <Separator />

      <div data-testid="dispatch-result" className="font-mono text-xs">
        {last === null && (
          <p className="text-muted-foreground">No dispatch yet.</p>
        )}
        {last?.kind === 'error' && (
          <p className="text-destructive">{last.message}</p>
        )}
        {last?.kind === 'dispatch' && (
          <div className="flex flex-wrap gap-4">
            <span>
              sent: <span data-testid="result-sent">{last.value.sent}</span>
            </span>
            <span>
              deduped:{' '}
              <span data-testid="result-deduped">{last.value.deduped}</span>
            </span>
            <span>
              suppressedByPrefs:{' '}
              <span data-testid="result-suppressed">
                {last.value.suppressedByPrefs}
              </span>
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};

'use client';

import { useTransition } from 'react';
import type { PrefRow } from '@/app/(protected)/inspector/_data';
import { setPref } from '@/app/(protected)/inspector/actions';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type PrefsPanelProps = { prefs: PrefRow[] };

type Channel = 'email' | 'inbox';

// The active user's preference toggles. team + billing categories show per-channel
// switches; a disabled security→email toggle shows the critical-channel affordance
// (toggling it has no server effect — there is no security event in this registry, but
// the disabled pattern is shown). A missing prefs row means default-on, so a category
// with no row reads every switch as on (the `?? true` the resolver applies at dispatch).
export const PrefsPanel = ({ prefs }: PrefsPanelProps) => {
  const [pending, startTransition] = useTransition();

  const valueFor = (category: string, channel: Channel): boolean => {
    const row = prefs.find((p) => p.category === category);
    // No row → default-on; a row → its column value.
    return row ? row[channel] : true;
  };

  const toggle = (category: string, channel: Channel, value: boolean) => {
    startTransition(async () => {
      await setPref(category, channel, value);
    });
  };

  const Row = ({
    category,
    channel,
    testId,
  }: {
    category: string;
    channel: Channel;
    testId: string;
  }) => (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">
        {category} · {channel}
      </span>
      <Switch
        data-testid={testId}
        disabled={pending}
        checked={valueFor(category, channel)}
        onCheckedChange={(v) => toggle(category, channel, v)}
      />
    </div>
  );

  return (
    <Card data-testid="prefs-panel" className="p-4">
      <h2 className="text-sm font-semibold">Preferences (active user)</h2>
      <Separator className="my-3" />
      <div className="flex flex-col gap-3">
        <Row category="team" channel="email" testId="pref-toggle-team-email" />
        <Row category="team" channel="inbox" testId="pref-toggle-team-inbox" />
        <Row
          category="billing"
          channel="email"
          testId="pref-toggle-billing-email"
        />
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">
            security · email
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Switch
                    data-testid="pref-toggle-security-email"
                    disabled
                    checked
                  />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Critical channel — cannot be turned off.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </Card>
  );
};

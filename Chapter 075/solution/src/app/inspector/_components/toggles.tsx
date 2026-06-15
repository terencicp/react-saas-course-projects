import { ActionButton } from '@/app/inspector/_components/action-button';
import {
  distinctIpReset,
  spoofIpSignIn,
  toggleAwaitPending,
  toggleForceDown,
  toggleGateAfterWork,
} from '@/app/inspector/actions';
import { Card } from '@/components/ui/card';

type TogglesProps = {
  forceDown: boolean;
  gateAfterWork: boolean;
  awaitPending: boolean;
  timingMs: number | null;
};

// The failure-mode toggles drive inspector-owned instrumented runners (never a flag
// the student's action reads): "Force Upstash down" swaps the live client for the
// down-mock to prove safeLimit fail-open; "Gate after work" / "Await pending" assemble
// alternate orderings to show why the student's ordering is correct; the "Distinct IPs
// runner" assembles the gate from the imported limiter + safeLimit with a fresh
// synthetic ip: key each iteration to prove the cross-IP per-email catch. One bounded
// element; the timing readout sits inside it.
export const Toggles = ({
  forceDown,
  gateAfterWork,
  awaitPending,
  timingMs,
}: TogglesProps) => (
  <Card data-testid="inspector-toggles" className="gap-3 p-4">
    <div className="text-sm font-semibold">Failure-mode toggles</div>

    <div className="flex flex-wrap items-center gap-2">
      <ActionButton
        action={toggleForceDown}
        size="sm"
        variant={forceDown ? 'destructive' : 'outline'}
        data-testid="force-down-toggle"
        data-on={forceDown}
      >
        Force Upstash down: {forceDown ? 'on' : 'off'}
      </ActionButton>
      <ActionButton
        action={toggleGateAfterWork}
        size="sm"
        variant={gateAfterWork ? 'default' : 'outline'}
        data-testid="gate-after-work-toggle"
        data-on={gateAfterWork}
      >
        Gate after work: {gateAfterWork ? 'on' : 'off'}
      </ActionButton>
      <ActionButton
        action={toggleAwaitPending}
        size="sm"
        variant={awaitPending ? 'default' : 'outline'}
        data-testid="await-pending-toggle"
        data-on={awaitPending}
      >
        Await pending: {awaitPending ? 'on' : 'off'}
      </ActionButton>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <ActionButton
        action={spoofIpSignIn}
        size="sm"
        variant="outline"
        data-testid="spoof-ip-runner"
      >
        Distinct IPs runner (sign-in)
      </ActionButton>
      <ActionButton
        action={distinctIpReset}
        size="sm"
        variant="outline"
        data-testid="distinct-ip-reset-runner"
      >
        Distinct IPs runner (reset)
      </ActionButton>
    </div>

    <div
      data-testid="timing-readout"
      className="font-mono text-xs text-muted-foreground"
    >
      per-call: {timingMs === null ? 'n/a' : `${timingMs.toFixed(1)}ms`}
    </div>
  </Card>
);

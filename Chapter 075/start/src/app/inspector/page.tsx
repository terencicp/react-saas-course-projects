import { connection } from 'next/server';
import { ActionButton } from '@/app/inspector/_components/action-button';
import { Controls } from '@/app/inspector/_components/controls';
import { IdentitySwitcher } from '@/app/inspector/_components/identity-switcher';
import { LogTail } from '@/app/inspector/_components/log-tail';
import { RemainingPanel } from '@/app/inspector/_components/remaining-panel';
import { ResponsesLog } from '@/app/inspector/_components/responses-log';
import { Toggles } from '@/app/inspector/_components/toggles';
import { UpstashBadge } from '@/app/inspector/_components/upstash-badge';
import { UpstashLink } from '@/app/inspector/_components/upstash-link';
import { resetCounters } from '@/app/inspector/actions';
import {
  readLogTail,
  readRemainingRows,
  readUpstashUp,
} from '@/app/inspector/inspector-reads';
import { inspectorState } from '@/app/inspector/inspector-store';
import { getMockEmailSentCount } from '@/lib/email';

// The rate-limit inspector. A Server Component reading server-side from Upstash
// (getRemaining, pingRedis) and from rate_limit_log; refreshes via the Server Actions
// in ./actions.ts. The student writes none of it. At scaffold it imports the student
// stubs and degrades gracefully — the remaining panel reads `n/a`, the spam buttons
// surface a "Not implemented" outcome, /api/limit-demo serves no RateLimit-* headers.
// It lights up slice by slice as the stubs are filled.
//
// Reframed from any HTTP-429/headers framing to the Result-shaped reality: every
// "response" is an action Result, not an HTTP response. The budget rides the Result;
// literal RateLimit-* headers exist only on /api/limit-demo. One bounded stack of
// data-testid panels; each panel is one element (the single-slot invariant).
const InspectorPage = async () => {
  // Opt this render into the dynamic (request-time) path before reading any
  // uncached source. The remaining-token readouts and reset countdowns call
  // `getRemaining` + `Date.now()`; under Cache Components, touching `Date.now()`
  // before a dynamic source throws at build time. `connection()` is that source.
  await connection();

  const [up, remainingRows, logRows] = await Promise.all([
    readUpstashUp(),
    readRemainingRows(),
    readLogTail(),
  ]);

  const { activeIdentity, responses, toggles, timingMs } = inspectorState;
  const mockEmailCount = getMockEmailSentCount();

  return (
    <main
      data-testid="inspector-page"
      className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10"
    >
      <header
        data-testid="inspector-header"
        className="flex flex-wrap items-center justify-between gap-4 border-b pb-4"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Rate-limit inspector</h1>
          <UpstashBadge up={up} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <IdentitySwitcher active={activeIdentity} />
          <ActionButton
            action={resetCounters}
            size="sm"
            variant="outline"
            data-testid="reset-counters"
          >
            Reset counters
          </ActionButton>
          <span
            data-testid="mock-email-count"
            className="font-mono text-xs text-muted-foreground"
          >
            mock emails: {mockEmailCount}
          </span>
          <UpstashLink />
        </div>
      </header>

      <RemainingPanel rows={remainingRows} />

      <div className="grid gap-6 md:grid-cols-2">
        <Controls />
        <Toggles
          forceDown={toggles.forceDown}
          gateAfterWork={toggles.gateAfterWork}
          awaitPending={toggles.awaitPending}
          timingMs={timingMs}
        />
      </div>

      <ResponsesLog responses={responses} />
      <LogTail rows={logRows} />
    </main>
  );
};

export default InspectorPage;

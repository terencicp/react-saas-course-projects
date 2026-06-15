import 'server-only';

import { runs } from '@trigger.dev/sdk/v3';

// Typed wrappers over the Trigger.dev REST API by run id. The inspector reads run
// state STRUCTURALLY through these — never by scraping log strings. At render time
// the REST call is never made: the run panel only fetches when a real `runId` is
// present, which the seed/simulate path leaves null/simulated. The SDK authenticates
// via TRIGGER_SECRET_KEY from the environment.

export type RunState = {
  status: string;
  metadata: Record<string, unknown>;
  output: unknown;
  attemptCount: number;
  completedAt: Date | null;
  error: { message: string } | null;
};

// Wraps runs.retrieve. The retrieve result exposes status/metadata/output/error
// directly; `attemptCount` is not a top-level field on the v4 retrieve shape, so it
// is read defensively (the field is named `attemptCount` on richer shapes; default
// to 1). The structural read is the point — the poller maps these into the panel,
// never a log scrape.
export const retrieveRun = async (runId: string): Promise<RunState> => {
  const run = await runs.retrieve(runId);
  const raw = run as unknown as {
    status: string;
    metadata?: Record<string, unknown>;
    output?: unknown;
    attemptCount?: number;
    finishedAt?: Date;
    error?: { message: string };
  };

  return {
    status: raw.status,
    metadata: raw.metadata ?? {},
    output: raw.output ?? null,
    attemptCount: raw.attemptCount ?? 1,
    completedAt: raw.finishedAt ?? null,
    error: raw.error ? { message: raw.error.message } : null,
  };
};

// Lists the recent runs tagged for an org (the `org:${orgId}` tag the action sets
// at trigger time). Filtering by tag is the structural cross-run query — no log
// scan. Returns the run id + status + tags for each, newest first.
export const listRunsForOrg = async (
  orgId: string,
): Promise<{ id: string; status: string; tags: string[] }[]> => {
  const page = await runs.list({ tag: `org:${orgId}` });
  return page.data.map((run) => ({
    id: run.id,
    status: run.status,
    tags: run.tags,
  }));
};

import { NextResponse } from 'next/server';

import { retrieveRun } from '@/lib/trigger-client';

// The run-state poller the inspector's run panel hits every 1s for a live run id.
// The Trigger.dev SDK's REST client needs Node APIs — route handlers run on the Node
// runtime by default, and under Cache Components an explicit `export const runtime =
// 'nodejs'` is rejected ("not compatible with nextConfig.cacheComponents"), so the
// default Node runtime stands (deviation from the plan's explicit runtime export —
// the installed Next 16.2.7 + cacheComponents surface wins). Not exercised by render
// checks: the poller only calls this with a real runId, which the seed/simulate path
// leaves null/simulated. Reads run state structurally via retrieveRun, never logs.
export const GET = async (
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
): Promise<Response> => {
  const { runId } = await params;

  try {
    const run = await retrieveRun(runId);
    return NextResponse.json({
      status: run.status,
      metadata: run.metadata,
      attemptCount: run.attemptCount,
      completedAt: run.completedAt,
      error: run.error,
    });
  } catch {
    return NextResponse.json(
      { error: { message: 'Could not retrieve run.' } },
      { status: 502 },
    );
  }
};

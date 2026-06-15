import { updateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { invoiceTags } from '@/lib/cache/tags';
import { getSession } from '@/server/session';

// The guaranteed-throw context for the "force updateTag from a non-action" demo.
// `updateTag` can ONLY be called from a Server Action (read-your-writes); the docs
// name Route Handlers as a context where it cannot be used. So this handler calls
// it inside try/catch and returns the caught error message as JSON — the framework
// enforcing its own architectural rule, surfaced as a string instead of a 500.
//
// Sets NO `runtime` export — Node default under `cacheComponents`. Reads only
// `session.orgId` and the pure tag helper (a Route Handler runs in a separate
// module instance, so it must not depend on shared mutable store state). The throw
// is about the call context, not the tag string, so it demonstrates correctly even
// while `invoiceTags.list` is still the empty-string stub (before S1).
const handler = async (): Promise<NextResponse> => {
  const session = await getSession();
  try {
    updateTag(invoiceTags.list(session.orgId));
    return NextResponse.json({
      ok: true,
      message: 'updateTag did not throw (unexpected in a Route Handler).',
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'updateTag failed.';
    return NextResponse.json({ ok: false, message });
  }
};

export const GET = handler;
export const POST = handler;

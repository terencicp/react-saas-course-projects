import { type NextRequest, NextResponse } from 'next/server';

// TODO(L5) — getSessionCookie presence gate, ?next= round-trip, inverse gate, matcher.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = { matcher: [] };

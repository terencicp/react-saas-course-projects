// The Stripe webhook ingress. Route handlers run on the Node.js runtime by default in
// Next 16 (which is what the Stripe SDK needs — constructEvent is synchronous on Node),
// so no `runtime` segment config is set: with cacheComponents enabled, Next rejects an
// explicit `runtime` export, and Node is already the default here.
//
// A `stripe trigger` 404s until L2 — the lesson-1 starting line.
//
// TODO(L2) — verify the signature (raw body, constructEvent, 400 problem+json)
// TODO(L3) — claim in one db.transaction + dispatch
export const POST = async (_request: Request): Promise<Response> =>
  new Response(null, { status: 404 });

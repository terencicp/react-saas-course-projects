// RFC 9457 problem+json. The webhook answers a verification failure with this
// shape so Stripe treats the delivery as terminal (a 4xx is not retried). The body
// carries only `type`/`title`/`status` — no `detail`, no echo of the request body
// (a verification failure must never leak what the caller sent). The title is a
// short machine-readable token (e.g. 'invalid_signature'), not a sentence.
export const problemJson = (status: number, title: string): Response =>
  new Response(JSON.stringify({ type: 'about:blank', title, status }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });

// The billing domain error — the machine-readable distinction the Result union does
// not carry (it has no payment_required code). Every billing surface throws this:
// require-plan.ts at the gate, the webhook handlers on a projection/tenancy failure.
//
// The `code` union is the complete vocabulary:
//   - no_access       — the entitlement is inactive (canceled/incomplete)
//   - plan_required   — the tier is too low for the gated surface
//   - no_customer     — openPortal hit an org with no Stripe Customer yet
//   - unknown_customer / unknown_plan — webhook-side: a Customer the app never created,
//     or a lookup_key not in the catalog; both 500 so Stripe retries.
//
// error.tsx discriminates on `code`: the /inspector/pro-only fallback renders the
// 'no_access' message ("subscription no longer active") vs the 'plan_required' message
// ("requires Pro — upgrade"). The prototype is lost across the boundary, so error.tsx
// reads `code` off the serialized shape, not `instanceof`.
//
// TODO(L5) — finalize the `code` union and wire error.tsx's discrimination on it. The
// class already constructs; L5 cements the code vocabulary the fallback switches over.
export class BillingError extends Error {
  override readonly name = 'BillingError' as const;
  readonly code:
    | 'no_access'
    | 'plan_required'
    | 'no_customer'
    | 'unknown_customer'
    | 'unknown_plan';

  constructor(
    code: BillingError['code'],
    public readonly userMessage: string,
  ) {
    super(userMessage);
    this.code = code;
  }
}

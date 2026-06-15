// The export domain error — the machine-readable distinction the Result union does
// not carry. The parent task wraps its message into an AbortTaskRunError for the
// permanent empty-resultset case (a plain throw would burn all three retries on
// inputs that can never succeed).
//
// `override readonly name`: the `override` modifier is required — `name` overrides
// Error.name and tsconfig sets noImplicitOverride: true; `override` precedes
// `readonly`, matching the 065 BillingError pattern.
//
// The `code` union is intentionally open: EMPTY_RESULTSET is thrown here;
// UNKNOWN_PLAN is forward-referenced (Stripe/plan entitlements are not part of this
// project) so the vocabulary is ready when a plan gate lands.
export class ExportError extends Error {
  override readonly name = 'ExportError' as const;
  readonly code: 'EMPTY_RESULTSET' | 'UNKNOWN_PLAN';

  constructor(code: ExportError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

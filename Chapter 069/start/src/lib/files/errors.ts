import { err, type Result } from '@/lib/result';

// The file-upload domain error — the machine-readable distinction the Result union
// does not carry. Thrown inside lib/files; mapped to a Result at the action boundary
// via toResult (an action returns a Result, never throws UploadError to the client).
//
// `override readonly name`: the `override` modifier is required — `name` overrides
// Error.name and tsconfig sets noImplicitOverride: true; `override` precedes
// `readonly`, matching the 065 BillingError / 067 ExportError pattern.
export class UploadError extends Error {
  override readonly name = 'UploadError' as const;
  readonly code:
    | 'unsupported-type'
    | 'too-large'
    | 'size-mismatch'
    | 'object-not-found';

  constructor(code: UploadError['code'], message: string) {
    super(message);
    this.code = code;
  }

  // Map each domain code to one of the seven Result error codes. A bad client claim
  // (unsupported-type / too-large) is `validation`; a server-observed mismatch the
  // HEAD catches (size-mismatch) is `conflict`; a missing object is `not_found`.
  static toResult(e: UploadError): Result<never> {
    switch (e.code) {
      case 'unsupported-type':
      case 'too-large':
        return err('validation', e.message);
      case 'size-mismatch':
        return err('conflict', e.message);
      case 'object-not-found':
        return err('not_found', e.message);
    }
  }
}

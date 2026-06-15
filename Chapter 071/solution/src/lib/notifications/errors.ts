// The notification module's two error dispositions. REGISTRY_MISS is a programmer
// error the dispatcher throws BEFORE the per-recipient loop and never swallows (an
// unknown event type must surface, not silently drop). RECIPIENT_NOT_FOUND is an
// expected channel failure the email channel throws when an address cannot be
// resolved; the dispatcher's per-channel try/catch logs and swallows it so one
// failing channel never kills the other.
export class NotificationError extends Error {
  override readonly name = 'NotificationError';
  readonly code: 'REGISTRY_MISS' | 'RECIPIENT_NOT_FOUND';

  constructor(code: 'REGISTRY_MISS' | 'RECIPIENT_NOT_FOUND', message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

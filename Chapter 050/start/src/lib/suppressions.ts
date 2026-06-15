import 'server-only';

export const isSuppressed = async (
  _email: string,
  _opts: { kind: 'transactional' | 'marketing' },
): Promise<{ suppressed: boolean; reason?: string; bypassUntil?: Date }> => {
  // TODO(L3) — normalize, query email_suppressions, apply bypassUntil + manual_unsubscribe/transactional rules
  return { suppressed: false };
};

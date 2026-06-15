import 'server-only';

// TODO(L5) — signedInviteUrl/verifyInviteSignature (HMAC over id.token, constant-time)
// + sha256; import the key once, non-extractable.
export const signedInviteUrl = async (
  _invitationId: string,
  _rawToken: string,
): Promise<string> => {
  throw new Error('signedInviteUrl not implemented');
};

export const verifyInviteSignature = async (
  _invitationId: string,
  _rawToken: string,
  _sig: string,
): Promise<boolean> => {
  throw new Error('verifyInviteSignature not implemented');
};

export const sha256 = async (_raw: string): Promise<string> => {
  throw new Error('sha256 not implemented');
};

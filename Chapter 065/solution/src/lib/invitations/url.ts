import 'server-only';

import { env } from '@/env';

// The accept URL is a capability: a 32-byte random token (base64url) whose sha256
// is the only form stored, plus an HMAC signature over `${id}.${token}` keyed by
// INVITATION_SIGNING_SECRET (distinct from BETTER_AUTH_SECRET). The key is imported
// once, non-extractable, with the sign/verify capability only — a lazily-awaited
// module-scope promise so the import cost is paid once per process. Verification
// uses crypto.subtle.verify (constant-time), never a string === on the signature.
const keyPromise = crypto.subtle.importKey(
  'raw',
  Buffer.from(env.INVITATION_SIGNING_SECRET, 'base64'),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);

const payload = (invitationId: string, rawToken: string): BufferSource =>
  new Uint8Array(new TextEncoder().encode(`${invitationId}.${rawToken}`));

export const generateInviteToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
};

export const signedInviteUrl = async (
  invitationId: string,
  rawToken: string,
): Promise<string> => {
  const key = await keyPromise;
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    payload(invitationId, rawToken),
  );
  const sig = Buffer.from(new Uint8Array(signature)).toString('base64url');

  const url = new URL('/accept-invite', env.NEXT_PUBLIC_APP_URL);
  url.searchParams.set('id', invitationId);
  url.searchParams.set('token', rawToken);
  url.searchParams.set('sig', sig);
  return url.toString();
};

export const verifyInviteSignature = async (
  invitationId: string,
  rawToken: string,
  sig: string,
): Promise<boolean> => {
  const key = await keyPromise;
  return crypto.subtle.verify(
    'HMAC',
    key,
    new Uint8Array(Buffer.from(sig, 'base64url')),
    payload(invitationId, rawToken),
  );
};

export const sha256 = async (raw: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(new TextEncoder().encode(raw)),
  );
  return Buffer.from(new Uint8Array(digest)).toString('hex');
};

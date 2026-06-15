import { createAuthClient } from 'better-auth/react';

// Same-origin client — no baseURL needed; the browser hits /api/auth on the
// current host. Used by the client islands (sign-in form, verify-email resend).
export const authClient = createAuthClient();

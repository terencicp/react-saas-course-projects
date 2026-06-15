import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Same-origin client — no baseURL needed; the browser hits /api/auth on the
// current host. Used by the client islands (sign-in form, verify-email resend,
// org switcher, create-org). The client plugin set must mirror the server's, or
// authClient.organization.* does not typecheck.
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

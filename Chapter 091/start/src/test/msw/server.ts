import { setupServer } from 'msw/node';

import { resendHandlers } from '@/test/msw/handlers/resend';

// The single MSW server — RESEND ONLY. Stripe is NOT on MSW: stripe@22's NodeHttpClient
// writes the request body in a socket `secureConnect` handler that never fires against
// MSW's mock socket, so a subscriptions.retrieve over the interceptor hangs forever
// (it never dispatches, so onUnhandledRequest can't even catch it). Stripe's
// subscriptions.retrieve is therefore stubbed at the SDK seam (vi.mock('@/lib/billing/stripe'))
// while webhooks.* stay real — see integration-setup.ts.
//
// integration-setup.ts calls server.listen({ onUnhandledRequest: 'error' }) in beforeAll,
// server.resetHandlers() in afterEach, server.close() in afterAll.
export const server = setupServer(...resendHandlers);

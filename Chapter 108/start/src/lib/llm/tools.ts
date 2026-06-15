import 'server-only';

import { type InferUITools, tool, type UIMessage } from 'ai';
import { z } from 'zod';

// TODO(L3) — getInvoiceStats: closure over orgId, aggregate outputSchema, return-don't-throw
export const buildInvoiceTools = (_ctx: { orgId: string }) => ({
  getInvoiceStats: tool({
    description: 'TODO',
    inputSchema: z.strictObject({}),
    outputSchema: z.strictObject({}),
    execute: async () => ({}),
  }),
});

export type InvoiceTools = ReturnType<typeof buildInvoiceTools>;

// The client imports only this — the typed message whose tool parts are backed
// by the real tool map.
export type InvoiceUIMessage = UIMessage<
  unknown,
  never,
  InferUITools<InvoiceTools>
>;

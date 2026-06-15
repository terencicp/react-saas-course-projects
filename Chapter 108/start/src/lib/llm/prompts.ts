import 'server-only';

// TODO(L2) — invoiceQAPrompt: force tool-grounding, refuse cross-org, define the { error } behavior
export const invoiceQAPrompt = (ctx: { orgName: string }): string =>
  `You answer questions about invoices for ${ctx.orgName}.`;

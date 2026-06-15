import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { z } from 'zod';
import { authedRoute } from '@/lib/authed-route';
import { writeLlmFinishEvent, writeLlmStepEvent } from '@/lib/llm/audit';
import { chatModel } from '@/lib/llm/models';
import { invoiceQAPrompt } from '@/lib/llm/prompts';
import { addUsage } from '@/lib/llm/quota';
import { buildInvoiceTools, type InvoiceUIMessage } from '@/lib/llm/tools';
import { withLlmQuota } from '@/lib/llm/with-llm-quota';

// The streaming chat endpoint. `withLlmQuota` wraps `authedRoute` (quota composed
// AROUND auth — cost enforcement can't be forgotten); the inner handler owns the
// loop with a server-side `stopWhen` cap and a `maxOutputTokens` ceiling, both
// non-negotiable. The schema accepts untyped `messages` on purpose —
// `convertToModelMessages` does the real validation; the route does not duplicate it.
export const POST = withLlmQuota(
  authedRoute(
    'member',
    z.strictObject({ messages: z.array(z.unknown()) }),
    async (input, ctx) => {
      const org = await ctx.db.query.organization.findFirst({
        where: (o) => o.id === ctx.orgId,
      });
      const orgName = org?.name ?? 'your organization';

      const tools = buildInvoiceTools({ orgId: ctx.orgId });

      const result = streamText({
        model: chatModel,
        system: invoiceQAPrompt({ orgName }),
        messages: convertToModelMessages(input.messages as InvoiceUIMessage[]),
        tools,
        stopWhen: stepCountIs(5),
        maxOutputTokens: 1024,
        onStepFinish: async ({ usage, toolCalls, finishReason }) => {
          await addUsage(
            ctx.userId,
            (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
          );
          await writeLlmStepEvent({
            userId: ctx.userId,
            orgId: ctx.orgId,
            finishReason,
            usage,
            toolCalls,
          });
        },
        onFinish: ({ usage, finishReason }) =>
          writeLlmFinishEvent({
            userId: ctx.userId,
            orgId: ctx.orgId,
            finishReason,
            usage,
          }),
        onError: ({ error }) => {
          console.error('[chat] stream error', { code: 'stream_error' });
          void error;
        },
      });

      return result.toUIMessageStreamResponse();
    },
  ),
);

import 'server-only';

import { pushLlmAuditEvent } from '@/server/store';

type StepArgs = {
  userId: string;
  orgId: string;
  finishReason?: string;
  usage?: unknown;
  toolCalls?: unknown;
};

type FinishArgs = {
  userId: string;
  orgId: string;
  finishReason?: string;
  usage?: unknown;
};

// One append-only row per agentic step. The SQL lineage's "bounded one-row
// transaction" is a single push here.
export const writeLlmStepEvent = async (args: StepArgs): Promise<void> => {
  pushLlmAuditEvent({
    userId: args.userId,
    orgId: args.orgId,
    event: 'llm.step',
    payload: {
      finishReason: args.finishReason,
      usage: args.usage,
      toolCalls: args.toolCalls,
    },
  });
};

// One append-only row per finished conversation.
export const writeLlmFinishEvent = async (args: FinishArgs): Promise<void> => {
  pushLlmAuditEvent({
    userId: args.userId,
    orgId: args.orgId,
    event: 'llm.finish',
    payload: {
      finishReason: args.finishReason,
      usage: args.usage,
    },
  });
};

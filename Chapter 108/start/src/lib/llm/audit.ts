import 'server-only';

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

// TODO(L2) — writeLlmStepEvent / writeLlmFinishEvent: push one llm.step / llm.finish event into the store
export const writeLlmStepEvent = async (_args: StepArgs): Promise<void> => {};

export const writeLlmFinishEvent = async (
  _args: FinishArgs,
): Promise<void> => {};

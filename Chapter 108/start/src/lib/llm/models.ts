import 'server-only';

// The one role-named model handle. A bare AI Gateway model id (`provider/model`)
// — the SDK routes it through the Vercel AI Gateway and reads AI_GATEWAY_API_KEY
// from process.env, so no provider package is imported. Swapping providers is a
// one-line change here; the call sites never name a model.
export const chatModel = 'openai/gpt-5-mini';

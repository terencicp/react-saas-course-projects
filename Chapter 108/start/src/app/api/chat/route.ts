// TODO(L2) — POST = withLlmQuota(authedRoute('member', …, streamText with stopWhen + onFinish)); tools in L3, quota increment in L4
export const POST = (_req: Request) =>
  Response.json(
    { ok: false, error: { code: 'not_implemented' } },
    { status: 501 },
  );

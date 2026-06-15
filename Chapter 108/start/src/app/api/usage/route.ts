// TODO(L4) — GET = authedRoute('member', …, readUsage(ctx.userId))
export const GET = (_req: Request) =>
  Response.json({ used: 0, cap: 100_000, remaining: 100_000 });

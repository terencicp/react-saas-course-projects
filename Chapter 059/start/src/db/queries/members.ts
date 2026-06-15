import 'server-only';

// TODO(L4) — listMembers(orgId) via tenantDb(orgId).query.member.findMany({ with: {
// user: true } }). Returns an empty list so the inspector's members panel renders its
// empty state in start.
export const listMembers = async (
  _orgId: string,
): Promise<
  {
    id: string;
    userId: string;
    role: string;
    user: { name: string; email: string } | null;
  }[]
> => [];

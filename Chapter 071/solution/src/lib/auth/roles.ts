// No `import 'server-only'` — pure role vocabulary, safe for client components.

export type Role = 'owner' | 'admin' | 'member';

export const ROLE_RANK = {
  member: 0,
  admin: 1,
  owner: 2,
} as const satisfies Record<Role, number>;

export const roleAtLeast = (role: Role, required: Role): boolean =>
  ROLE_RANK[role] >= ROLE_RANK[required];

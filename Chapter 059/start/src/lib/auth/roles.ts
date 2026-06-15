// No `import 'server-only'` — pure role vocabulary, safe for client components.

export type Role = 'owner' | 'admin' | 'member';

export const ROLE_RANK = { member: 0, admin: 1, owner: 2 } as const;

// TODO(L2) — order the three roles via ROLE_RANK; roleAtLeast compares.
export const roleAtLeast = (_role: Role, _required: Role): boolean => false;

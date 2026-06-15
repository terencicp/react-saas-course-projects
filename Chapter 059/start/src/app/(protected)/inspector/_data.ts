import 'server-only';

import { requireOrgUser } from '@/lib/auth';
import type { Role } from '@/lib/auth/roles';

// The inspector's own read path. It starts from the session-derived requireOrgUser
// (the real { user, orgId, role }) and, in development only, lets the dev acting-user
// cookie override which seeded identity the page renders as — so the switcher can show
// each role without a real sign-in dance. This override lives HERE, in the inspector's
// read path, and never touches requireOrgUser: the privileged actions (changeMemberRole,
// sendInvitation) still resolve identity from the validated session, so the dev cookie
// cannot spoof a real mutation.
//
// TODO(L2) — once the organization plugin + the org/member tables exist, resolve the
// acting identity: read the ACTING_USER_COOKIE (dev only) and, when set, swap to that
// seeded user's active membership (org/role); resolve the org name and the user's orgs
// (the OrgSwitcher) and the org's members (the ActingUserSwitcher). Until then this
// returns the signed-in user with empty switcher data so the inspector renders its
// placeholder banner without throwing.

type SwitchableOrg = { id: string; name: string };
type SeededUser = { id: string; name: string; role: string };

type InspectorContext = {
  userId: string;
  orgId: string;
  orgName: string;
  role: Role;
  orgs: SwitchableOrg[];
  members: SeededUser[];
};

export const getInspectorContext = async (): Promise<InspectorContext> => {
  const { user, orgId, role } = await requireOrgUser();

  return {
    userId: user.id,
    orgId,
    orgName: orgId || 'No active organization',
    role,
    orgs: [],
    members: [],
  };
};

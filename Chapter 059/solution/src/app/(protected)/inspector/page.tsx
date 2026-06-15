import { Suspense } from 'react';
import { OrgSwitcher } from '@/app/(protected)/dashboard/org-switcher';
import { ActingUserSwitcher } from '@/app/(protected)/inspector/_components/acting-user-switcher';
import { CopyAcceptUrl } from '@/app/(protected)/inspector/_components/copy-accept-url';
import { InviteForm } from '@/app/(protected)/inspector/_components/invite-form';
import { RoleSelectRow } from '@/app/(protected)/inspector/_components/role-select-row';
import { getInspectorContext } from '@/app/(protected)/inspector/_data';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { auditLogCount, recentAuditLogs } from '@/db/queries/audit';
import { listPendingInvitations } from '@/db/queries/invitations';
import { listMembers } from '@/db/queries/members';

// The verification surface for the org/RBAC/audit/invitation work. It renders the
// privileged controls to EVERY acting identity on purpose — the server-side refusal,
// not a client-side hide, is the observable defense. Each panel is one bounded
// region with a data-testid. Request-time reads sit behind <Suspense>; the helpers
// it calls are stubs at scaffold time and return empty/placeholder data, never throw.

const isDev = process.env.NODE_ENV !== 'production';

const ActiveOrgBanner = async () => {
  const { userId, orgId, orgName, role, orgs, members } =
    await getInspectorContext();

  return (
    <Card
      data-testid="active-org-banner"
      className="flex flex-wrap items-center justify-between gap-4 p-4"
    >
      <div>
        <p className="text-xs uppercase text-muted-foreground">Active org</p>
        <p data-testid="org-name" className="text-lg font-semibold">
          {orgName}
        </p>
        <p data-testid="acting-role" className="text-sm text-muted-foreground">
          {role}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <OrgSwitcher orgs={orgs} activeOrgId={orgId} />
        {isDev && <ActingUserSwitcher users={members} activeUserId={userId} />}
      </div>
    </Card>
  );
};

const MembersPanel = async () => {
  const { orgId } = await getInspectorContext();
  const members = await listMembers(orgId);

  return (
    <Card data-testid="members-panel" className="p-4">
      <h2 className="text-sm font-semibold">Members</h2>
      <Separator className="my-3" />
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.id}
              data-testid="member-row"
              className="flex items-center justify-between gap-4"
            >
              <span className="text-sm">
                {member.user?.name ?? member.userId}
              </span>
              <RoleSelectRow memberId={member.id} currentRole={member.role} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const InvitePanel = () => (
  <Card data-testid="invite-panel" className="p-4">
    <h2 className="text-sm font-semibold">Invite a member</h2>
    <Separator className="my-3" />
    <InviteForm />
  </Card>
);

const PendingPanel = async () => {
  const { orgId } = await getInspectorContext();
  const pending = await listPendingInvitations(orgId);

  return (
    <Card data-testid="pending-panel" className="p-4">
      <h2 className="text-sm font-semibold">Pending invitations</h2>
      <Separator className="my-3" />
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending invitations.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pending.map((invite) => (
            <li
              key={invite.id}
              data-testid="pending-row"
              className="flex items-center justify-between gap-4"
            >
              <span className="text-sm">
                {invite.email} · {invite.role}
              </span>
              {isDev && <CopyAcceptUrl url={invite.acceptUrl ?? ''} />}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const AuditTail = async () => {
  const { orgId } = await getInspectorContext();
  const rows = await recentAuditLogs(orgId);

  return (
    <Card data-testid="audit-tail" className="p-4">
      <h2 className="text-sm font-semibold">Audit log</h2>
      <Separator className="my-3" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id} data-testid="audit-row" className="text-sm">
              {row.action}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const RawHelpersPanel = async () => {
  const { orgId } = await getInspectorContext();
  const count = await auditLogCount(orgId);

  return (
    <Card data-testid="raw-helpers-panel" className="p-4">
      <h2 className="text-sm font-semibold">Raw helpers</h2>
      <Separator className="my-3" />
      <dl className="text-sm">
        <dt className="text-muted-foreground">auditLogs count (current org)</dt>
        <dd data-testid="audit-count" className="font-mono">
          {count}
        </dd>
      </dl>
    </Card>
  );
};

const InspectorPage = () => (
  <section
    data-testid="inspector-page"
    className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10"
  >
    <h1 className="text-2xl font-semibold">Inspector</h1>

    <Suspense>
      <ActiveOrgBanner />
    </Suspense>

    <div className="grid gap-6 md:grid-cols-2">
      <Suspense>
        <MembersPanel />
      </Suspense>
      <InvitePanel />
      <Suspense>
        <PendingPanel />
      </Suspense>
      <Suspense>
        <AuditTail />
      </Suspense>
    </div>

    <Suspense>
      <RawHelpersPanel />
    </Suspense>
  </section>
);

export default InspectorPage;

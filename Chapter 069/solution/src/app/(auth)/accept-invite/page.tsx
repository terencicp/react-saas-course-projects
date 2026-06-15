import { eq } from 'drizzle-orm';

import { AcceptForm } from '@/app/(auth)/accept-invite/accept-form';
import { buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { db } from '@/db';
import { getInvitationById } from '@/db/queries/invitations';
import { organization, user } from '@/db/schema/auth';
import { getCurrentUser } from '@/lib/auth';
import { sha256, verifyInviteSignature } from '@/lib/invitations/url';

// The accept surface. The verify ladder runs at the top of render in a fixed order;
// its first three failures (bad signature / no row / hash mismatch) collapse to one
// generic refusal — the public is never told which check failed. Verification fails
// closed: any thrown error in the ladder lands on the same refusal. No DB writes
// happen here; the page only decides which single arrival-shape surface to render,
// and the displayed values come from the row loaded by id, never from searchParams.

const shellClass = 'mx-auto max-w-md px-6 py-16';

const InviteRefused = () => (
  <main data-testid="accept-page" className={shellClass}>
    <Card data-testid="invite-refused" className="p-6 text-center">
      <h1 className="text-lg font-semibold">This invitation can’t be used</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link is invalid or has been withdrawn. Ask whoever invited you to
        send a fresh invitation.
      </p>
    </Card>
  </main>
);

const InviteExpired = () => (
  <main data-testid="accept-page" className={shellClass}>
    <Card data-testid="invite-expired" className="p-6 text-center">
      <h1 className="text-lg font-semibold">This invitation has expired</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Ask whoever invited you to send a new one.
      </p>
    </Card>
  </main>
);

const AlreadyMember = () => (
  <main data-testid="accept-page" className={shellClass}>
    <Card data-testid="already-member" className="p-6 text-center">
      <h1 className="text-lg font-semibold">You’re already in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This invitation has already been accepted.
      </p>
      <a href="/dashboard" className={`${buttonVariants()} mt-4`}>
        Go to dashboard
      </a>
    </Card>
  </main>
);

const AcceptMismatch = ({ invitedEmail }: { invitedEmail: string }) => (
  <main data-testid="accept-page" className={shellClass}>
    <Card data-testid="accept-mismatch" className="p-6 text-center">
      <h1 className="text-lg font-semibold">Wrong account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This invitation was sent to {invitedEmail}. Sign in with that address to
        accept it.
      </p>
    </Card>
  </main>
);

const AcceptSignIn = ({
  invitedEmail,
  next,
}: {
  invitedEmail: string;
  next: string;
}) => (
  <main data-testid="accept-page" className={shellClass}>
    <Card data-testid="accept-signin" className="p-6 text-center">
      <h1 className="text-lg font-semibold">Sign in to accept</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You already have an account for {invitedEmail}. Sign in to accept this
        invitation.
      </p>
      <a
        href={`/sign-in?next=${encodeURIComponent(next)}`}
        className={`${buttonVariants()} mt-4`}
      >
        Sign in
      </a>
    </Card>
  </main>
);

const AcceptSignUp = ({
  invitedEmail,
  next,
}: {
  invitedEmail: string;
  next: string;
}) => (
  <main data-testid="accept-page" className={shellClass}>
    <Card data-testid="accept-signup" className="p-6 text-center">
      <h1 className="text-lg font-semibold">Create an account to accept</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Set up an account for {invitedEmail} to join the organization.
      </p>
      <a
        href={`/sign-up?next=${encodeURIComponent(next)}`}
        className={`${buttonVariants()} mt-4`}
      >
        Create account
      </a>
    </Card>
  </main>
);

const AcceptConsent = ({
  invitationId,
  token,
  orgName,
  inviterName,
  role,
}: {
  invitationId: string;
  token: string;
  orgName: string;
  inviterName: string;
  role: string;
}) => (
  <main data-testid="accept-page" className={shellClass}>
    <Card className="p-6">
      <h1 className="text-lg font-semibold">Join {orgName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {inviterName} invited you to {orgName} as{' '}
        <span className="font-medium text-foreground">{role}</span>.
      </p>
      <div className="mt-4">
        <AcceptForm invitationId={invitationId} token={token} />
      </div>
    </Card>
  </main>
);

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; token?: string; sig?: string }>;
}) {
  const { id = '', token = '', sig = '' } = await searchParams;

  if (!(await verifyInviteSignature(id, token, sig))) {
    return <InviteRefused />;
  }

  const invitation = await getInvitationById(id);
  if (!invitation || (await sha256(token)) !== invitation.tokenHash) {
    return <InviteRefused />;
  }

  if (invitation.expiresAt < new Date()) {
    return <InviteExpired />;
  }

  if (invitation.status === 'accepted') {
    return <AlreadyMember />;
  }
  if (invitation.status !== 'pending') {
    return <InviteRefused />;
  }

  const next = `/accept-invite?${new URLSearchParams({ id, token, sig }).toString()}`;
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    const account = await db.query.user.findFirst({
      where: eq(user.email, invitation.email),
    });
    return account ? (
      <AcceptSignIn invitedEmail={invitation.email} next={next} />
    ) : (
      <AcceptSignUp invitedEmail={invitation.email} next={next} />
    );
  }

  if (currentUser.email.toLowerCase() !== invitation.email) {
    return <AcceptMismatch invitedEmail={invitation.email} />;
  }

  const [org, inviter] = await Promise.all([
    db.query.organization.findFirst({
      where: eq(organization.id, invitation.organizationId),
    }),
    db.query.user.findFirst({ where: eq(user.id, invitation.inviterId) }),
  ]);

  return (
    <AcceptConsent
      invitationId={id}
      token={token}
      orgName={org?.name ?? 'the organization'}
      inviterName={inviter?.name ?? 'Someone'}
      role={invitation.role ?? 'member'}
    />
  );
}

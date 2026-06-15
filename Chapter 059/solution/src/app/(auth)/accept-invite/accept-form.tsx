'use client';

import { useActionState } from 'react';

import { SubmitButton } from '@/app/_components/submit-button';
import { Card } from '@/components/ui/card';
import { acceptInvitation } from '@/lib/invitations/accept';

type AcceptFormProps = {
  invitationId: string;
  token: string;
};

// The consent gate. acceptInvitation is the two-arg useActionState reducer, whose
// type is not assignable to a Server Component <form action>; it must be wired here
// in a client island. The hidden inputs carry id + token only — never sig, since the
// action re-verifies via the stored tokenHash on its own (separate) request. The
// Accept button is explicit: there is no auto-accept on GET.
export const AcceptForm = ({ invitationId, token }: AcceptFormProps) => {
  const [state, formAction] = useActionState(acceptInvitation, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={invitationId} />
      <input type="hidden" name="token" value={token} />

      {state?.ok === false && (
        <Card className="p-3 text-sm text-destructive" role="alert">
          {state.error.userMessage}
        </Card>
      )}

      <SubmitButton data-testid="accept-button">Accept invitation</SubmitButton>
    </form>
  );
};

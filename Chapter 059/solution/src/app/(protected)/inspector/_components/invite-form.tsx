'use client';

import { useActionState } from 'react';

import { FieldError } from '@/app/_components/field-error';
import { SubmitButton } from '@/app/_components/submit-button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { sendInvitation } from '@/lib/invitations/send';

// The invite form posts email + role to sendInvitation. Role options are admin /
// member only — owner is the transfer flow, not built. Uncontrolled inputs; the
// action's parse seam owns validation.
export const InviteForm = () => {
  const [state, formAction] = useActionState(sendInvitation, null);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.ok === false && (
        <Card className="p-3 text-sm text-destructive" role="alert">
          {state.error.userMessage}
        </Card>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          data-testid="invite-email-input"
        />
        <FieldError name="email" fieldErrors={fieldErrors} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <Select name="role" defaultValue="member">
          <SelectTrigger
            id="invite-role"
            className="w-40"
            data-testid="invite-role-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">admin</SelectItem>
            <SelectItem value="member">member</SelectItem>
          </SelectContent>
        </Select>
        <FieldError name="role" fieldErrors={fieldErrors} />
      </div>

      <SubmitButton data-testid="invite-submit">Send invitation</SubmitButton>
    </form>
  );
};

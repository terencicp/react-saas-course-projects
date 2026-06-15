'use client';

import { useActionState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { changeMemberRole } from '@/lib/invitations/manage';

type RoleSelectRowProps = {
  memberId: string;
  currentRole: string;
};

// The role-change control is rendered to EVERY member row regardless of the acting
// role — the server-side refusal (forbidden) is the observable defense, not a
// client-side hide. Posts memberId + newRole to changeMemberRole via useActionState.
export const RoleSelectRow = ({
  memberId,
  currentRole,
}: RoleSelectRowProps) => {
  const [state, formAction] = useActionState(changeMemberRole, null);

  return (
    <div className="flex items-center gap-2">
      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="memberId" value={memberId} />
        <Select
          name="newRole"
          defaultValue={currentRole}
          onValueChange={(value) => {
            const data = new FormData();
            data.set('memberId', memberId);
            data.set('newRole', value);
            formAction(data);
          }}
        >
          <SelectTrigger className="w-32" data-testid="role-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">admin</SelectItem>
            <SelectItem value="member">member</SelectItem>
          </SelectContent>
        </Select>
      </form>
      {state?.ok === false && (
        <span className="text-xs text-destructive" role="alert">
          {state.error.userMessage}
        </span>
      )}
    </div>
  );
};

'use client';

import { useActionState } from 'react';

import { switchIdentity } from '@/app/(protected)/inspector/actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type SeededUser = {
  id: string;
  name: string;
  role: string;
};

type ActingUserSwitcherProps = {
  users: SeededUser[];
  activeUserId: string;
};

// Dev-only identity swap. Submits userId to switchUserAction (cookie write) and the
// page re-renders as the chosen seeded identity. Rendered only in non-production.
export const ActingUserSwitcher = ({
  users,
  activeUserId,
}: ActingUserSwitcherProps) => {
  const [, formAction] = useActionState(switchIdentity, null);

  return (
    <form action={formAction} data-testid="identity-switcher">
      <Select
        name="userId"
        defaultValue={activeUserId || undefined}
        onValueChange={(value) => {
          const data = new FormData();
          data.set('userId', value);
          formAction(data);
        }}
      >
        <SelectTrigger className="w-56" data-testid="acting-user-trigger">
          <SelectValue placeholder="Act as…" />
        </SelectTrigger>
        <SelectContent>
          {users.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.name} ({user.role})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  );
};

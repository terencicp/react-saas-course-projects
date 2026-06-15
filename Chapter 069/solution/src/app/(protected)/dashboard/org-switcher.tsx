'use client';

import { useRouter } from 'next/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { authClient } from '@/lib/auth-client';

export type SwitchableOrg = {
  id: string;
  name: string;
};

type OrgSwitcherProps = {
  orgs: SwitchableOrg[];
  activeOrgId: string;
};

// Switches the active organization in-session via the client plugin, then refreshes
// so every Server Component re-reads requireOrgUser against the new active org.
export const OrgSwitcher = ({ orgs, activeOrgId }: OrgSwitcherProps) => {
  const router = useRouter();

  return (
    <Select
      defaultValue={activeOrgId || undefined}
      onValueChange={async (organizationId) => {
        await authClient.organization.setActive({ organizationId });
        router.refresh();
      }}
    >
      <SelectTrigger className="w-56" data-testid="org-switcher">
        <SelectValue placeholder="Switch organization…" />
      </SelectTrigger>
      <SelectContent>
        {orgs.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

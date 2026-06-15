'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

// The no-active-org landing. requireOrgUser redirects here when the signed-in user
// belongs to no organization. Creating one sets it active (the plugin default), then
// we send the user on to the dashboard.
export default function CreateOrgPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);

    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const result = await authClient.organization.create({ name, slug });

    if (result.error) {
      setError(result.error.message ?? 'Could not create the organization.');
      setPending(false);
      return;
    }

    router.push('/dashboard');
  };

  return (
    <section
      data-testid="create-org-page"
      className="mx-auto max-w-md px-6 py-16"
    >
      <h1 className="text-2xl font-semibold">Create your organization</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Every workspace belongs to an organization. Name yours to get started.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        {error && (
          <Card className="p-3 text-sm text-destructive" role="alert">
            {error}
          </Card>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            data-testid="create-org-name"
          />
        </div>
        <Button
          type="submit"
          disabled={pending}
          data-testid="create-org-submit"
        >
          {pending ? 'Creating…' : 'Create organization'}
        </Button>
      </form>
    </section>
  );
}

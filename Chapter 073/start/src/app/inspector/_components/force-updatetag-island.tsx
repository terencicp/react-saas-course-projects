'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

// The force-`updateTag`-from-job demo. A plain <Link>/<a> to the route would
// navigate the browser AWAY from /inspector (the route returns JSON), which the
// `r-force-updatetag-throws` check forbids. So this Client Component `fetch()`es
// the Route Handler, reads the returned JSON `message`, and renders it into
// `job-result` — the page stays on /inspector and the throw message surfaces.
export const ForceUpdateTagIsland = () => {
  const [message, setMessage] = useState<string>('');
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      try {
        const res = await fetch('/inspector/force-updatetag', {
          method: 'POST',
        });
        const data: { message?: string } = await res.json();
        setMessage(data.message ?? 'No message returned.');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Request failed.');
      }
    });
  };

  return (
    <section className="space-y-2">
      <h2 className="font-medium">Force updateTag from job</h2>
      <p className="text-xs text-muted-foreground">
        Calls <span className="font-mono">updateTag</span> from a Route Handler
        — a non-Server-Action context — which the framework throws on. The error
        is surfaced as a string, not a crash.
      </p>
      <Button
        data-testid="force-updatetag-job"
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={onClick}
      >
        {pending ? 'Calling…' : 'Force updateTag from job'}
      </Button>
      <p
        data-testid="job-result"
        className="font-mono text-xs text-destructive"
      >
        {message}
      </p>
    </section>
  );
};

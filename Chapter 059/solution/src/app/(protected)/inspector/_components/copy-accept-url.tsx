'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

type CopyAcceptUrlProps = {
  url: string;
};

// Dev affordance: copy a pending invite's canonical signed accept URL to the
// clipboard so the flow can be exercised without opening the email.
export const CopyAcceptUrl = ({ url }: CopyAcceptUrlProps) => {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="copy-accept-url"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }}
    >
      {copied ? 'Copied' : 'Copy accept URL'}
    </Button>
  );
};

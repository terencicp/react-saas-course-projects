'use client';

import { useConsent } from '@/app/_components/consent-provider';
import { Button } from '@/components/ui/button';

// The consent banner (081 L5). Accept and Reject are equal-weight, one click each,
// and both route through the hook — `accept`/`reject` call the single consent.ts seam,
// never an inline cookie write. The banner shows only while the choice is undecided;
// a reject dismisses it with the flag still off (unset behaves identically to reject).
export const ConsentBanner = () => {
  const { decided, accept, reject } = useConsent();

  if (decided) {
    return null;
  }

  return (
    <div
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          We use product analytics to understand which features earn their
          weight. Nothing non-essential runs until you choose.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={reject}>
            Reject
          </Button>
          <Button onClick={accept}>Accept</Button>
        </div>
      </div>
    </div>
  );
};

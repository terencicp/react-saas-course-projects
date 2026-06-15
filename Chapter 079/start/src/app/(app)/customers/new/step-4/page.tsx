'use client';

// TODO(L4) — review via useShallow

import { SubmitButton } from '@/app/(app)/customers/new/step-4/submit-button';

const Step4Page = () => (
  <div data-testid="step-4" className="space-y-6">
    <h2 className="text-lg font-medium">Review</h2>
    <p className="text-sm text-muted-foreground">Review not wired yet</p>
    <SubmitButton />
  </div>
);

export default Step4Page;

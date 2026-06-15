'use client';

import { useActionState } from 'react';
import { FieldError } from '@/app/_components/field-error';
import { SubmitButton } from '@/app/_components/submit-button';
import { resetAction } from '@/app/(auth)/reset/actions';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const ResetForm = () => {
  const [state, formAction] = useActionState(resetAction, null);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  // Enumeration-uniform: on success the form renders the same confirmation whether
  // or not the address exists. The opaque rate-limit message lands in the error card
  // on code === 'rate_limited'. No navigation — reset shows the confirmation in place.
  if (state?.ok === true) {
    return (
      <Card data-testid="reset-confirmation" className="p-4 text-sm">
        If an account exists, a reset link is on its way.
      </Card>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.ok === false && (
        <Card
          data-testid="reset-error-card"
          className="p-4 text-sm text-destructive"
        >
          {state.error.userMessage}
        </Card>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        {/* Non-required: the action's parse seam owns empty-field validation. */}
        <Input
          id="email"
          name="email"
          type="email"
          data-testid="reset-email-input"
        />
        <FieldError name="email" fieldErrors={fieldErrors} />
      </div>

      <SubmitButton data-testid="reset-submit">Send reset link</SubmitButton>
    </form>
  );
};

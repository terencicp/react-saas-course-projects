'use client';

import { useActionState } from 'react';
import { FieldError } from '@/app/_components/field-error';
import { SubmitButton } from '@/app/_components/submit-button';
import { signUpAction } from '@/app/(auth)/sign-up/actions';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const SignUpForm = () => {
  const [state, formAction] = useActionState(signUpAction, null);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.ok === false && (
        <Card
          data-testid="signup-error-card"
          className="p-4 text-sm text-destructive"
        >
          {state.error.userMessage}
        </Card>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" data-testid="name-input" />
        <FieldError name="name" fieldErrors={fieldErrors} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        {/* Non-required: the action's parse seam owns empty-field validation. */}
        <Input id="email" name="email" type="email" data-testid="email-input" />
        <FieldError name="email" fieldErrors={fieldErrors} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          data-testid="password-input"
        />
        <FieldError name="password" fieldErrors={fieldErrors} />
      </div>

      <SubmitButton data-testid="sign-up-submit">Create account</SubmitButton>
    </form>
  );
};

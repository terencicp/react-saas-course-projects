'use client';

import { useActionState } from 'react';
import { FieldError } from '@/app/_components/field-error';
import { SubmitButton } from '@/app/_components/submit-button';
import { signInAction } from '@/app/(auth)/sign-in/actions';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type SignInFormProps = {
  next?: string;
};

export const SignInForm = ({ next }: SignInFormProps) => {
  const [state, formAction] = useActionState(signInAction, null);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* The one controlled value: the open-redirect-guarded next target. */}
      <input type="hidden" name="next" value={next ?? ''} />

      {state?.ok === false && (
        <Card
          data-testid="signin-error-card"
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
          data-testid="signin-email-input"
        />
        <FieldError name="email" fieldErrors={fieldErrors} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          data-testid="signin-password-input"
        />
        <FieldError name="password" fieldErrors={fieldErrors} />
      </div>

      <SubmitButton data-testid="sign-in-submit">Sign in</SubmitButton>
    </form>
  );
};

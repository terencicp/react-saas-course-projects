'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { FieldError } from '@/app/_components/field-error';
import { SubmitButton } from '@/app/_components/submit-button';
import { signInAction } from '@/app/(auth)/sign-in/actions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

type SignInFormProps = {
  next?: string;
};

export const SignInForm = ({ next }: SignInFormProps) => {
  const [state, formAction] = useActionState(signInAction, null);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;
  const emailRef = useRef<HTMLInputElement>(null);
  const [resent, setResent] = useState(false);
  const router = useRouter();

  // The success path no longer redirect()s server-side (the budget rides the
  // Result, which a redirect-throw can't carry) — the form navigates here. typedRoutes
  // brands `Route`, so the runtime-string redirectTo is cast at this one site.
  useEffect(() => {
    if (state?.ok === true) {
      router.push(state.data.redirectTo as Route);
    }
  }, [state, router]);

  const handleResend = async () => {
    const email = emailRef.current?.value ?? '';
    await authClient.sendVerificationEmail({ email });
    setResent(true);
  };

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
          {state.error.code === 'forbidden' && (
            <div className="mt-2">
              <Button
                type="button"
                variant="link"
                data-testid="resend-link"
                onClick={handleResend}
                className="h-auto p-0"
              >
                {resent
                  ? 'Verification email sent'
                  : 'Resend verification email'}
              </Button>
            </div>
          )}
        </Card>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        {/* Non-required: the action's parse seam owns empty-field validation. */}
        <Input
          ref={emailRef}
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

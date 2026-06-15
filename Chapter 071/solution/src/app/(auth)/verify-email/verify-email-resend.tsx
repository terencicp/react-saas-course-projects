'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

type VerifyEmailResendProps = {
  email: string;
};

export const VerifyEmailResend = ({ email }: VerifyEmailResendProps) => {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    setPending(true);
    await authClient.sendVerificationEmail({
      email,
      callbackURL: '/dashboard',
    });
    setPending(false);
    setSent(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        data-testid="resend-button"
        onClick={handleResend}
        disabled={pending}
      >
        Resend verification email
      </Button>
      {sent && (
        <p
          data-testid="resend-confirmation"
          className="text-sm text-muted-foreground"
        >
          Sent — check your inbox
        </p>
      )}
    </div>
  );
};

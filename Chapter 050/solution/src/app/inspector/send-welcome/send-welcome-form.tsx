'use client';

import { useActionState } from 'react';

import { FieldError } from '@/app/_components/field-error';
import { SubmitButton } from '@/app/_components/submit-button';
import { sendWelcomeEmail } from '@/app/actions/send-welcome';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const SendWelcomeForm = () => {
  const [state, formAction] = useActionState(sendWelcomeEmail, null);
  const fieldErrors = state?.ok === false ? state.error.fieldErrors : undefined;

  return (
    <section className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="grid gap-2">
          <Label htmlFor="recipientEmail">Recipient email</Label>
          <Input
            id="recipientEmail"
            name="recipientEmail"
            type="email"
            autoComplete="off"
            defaultValue="suppressed@send.acme.example"
            data-testid="recipient-input"
            aria-describedby="recipientEmail-error"
            aria-invalid={!!fieldErrors?.recipientEmail?.[0]}
          />
          <FieldError name="recipientEmail" fieldErrors={fieldErrors} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="off"
            defaultValue="Ada"
            data-testid="firstname-input"
            aria-describedby="firstName-error"
            aria-invalid={!!fieldErrors?.firstName?.[0]}
          />
          <FieldError name="firstName" fieldErrors={fieldErrors} />
        </div>

        <SubmitButton data-testid="send-button">Send welcome</SubmitButton>
      </form>

      {state?.ok === true && (
        <Card data-testid="success-card">
          <CardHeader>
            <CardTitle>Sent</CardTitle>
            <CardDescription>
              Resend accepted the message (id {state.data.id}).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <a
              className="text-brand underline"
              href={`https://resend.com/emails/${state.data.id}`}
              target="_blank"
              rel="noreferrer"
            >
              View in Resend dashboard
            </a>
            <p className="text-muted-foreground">
              Check the recipient inbox to confirm delivery.
            </p>
          </CardContent>
        </Card>
      )}

      {state?.ok === false && state.error.code === 'forbidden' && (
        <Card data-testid="suppression-card">
          <CardHeader>
            <CardTitle>Suppression path hit — Resend was NOT called</CardTitle>
            <CardDescription>{state.error.userMessage}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The recipient is on the suppression list, so the wrapper
            short-circuited at the gate before any external call. This is the
            chokepoint every future email flow passes through.
          </CardContent>
        </Card>
      )}

      {state?.ok === false && state.error.code !== 'forbidden' && (
        <Card data-testid="error-card">
          <CardHeader>
            <CardTitle>Could not send</CardTitle>
            <CardDescription>{state.error.userMessage}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </section>
  );
};

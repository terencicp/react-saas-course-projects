import { VerifyEmailResend } from '@/app/(auth)/verify-email/verify-email-resend';

type VerifyEmailPageProps = {
  searchParams: Promise<{ email?: string }>;
};

const VerifyEmailPage = async ({ searchParams }: VerifyEmailPageProps) => {
  const { email } = await searchParams;

  return (
    <main
      data-testid="verify-email-page"
      className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16"
    >
      <h1 className="text-2xl font-semibold">Check your inbox</h1>
      <p className="text-sm text-muted-foreground">
        We sent a verification link to{' '}
        <span
          data-testid="verify-email-address"
          className="font-medium text-foreground"
        >
          {email}
        </span>
        .
      </p>
      <p className="text-sm text-muted-foreground">
        Click the link to verify — it expires in 1 hour.
      </p>
      <VerifyEmailResend email={email ?? ''} />
    </main>
  );
};

export default VerifyEmailPage;

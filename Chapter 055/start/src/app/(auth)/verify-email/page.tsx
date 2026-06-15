type VerifyEmailPageProps = {
  searchParams: Promise<{ email?: string }>;
};

// TODO(L3) — show the target email, guidance, and a resend button (authClient.sendVerificationEmail).
const VerifyEmailPage = async ({ searchParams }: VerifyEmailPageProps) => {
  await searchParams;

  return (
    <main
      data-testid="verify-email-page"
      className="mx-auto flex max-w-sm flex-col gap-4 px-6 py-16"
    >
      <h1 className="text-2xl font-semibold">Check your inbox</h1>
    </main>
  );
};

export default VerifyEmailPage;

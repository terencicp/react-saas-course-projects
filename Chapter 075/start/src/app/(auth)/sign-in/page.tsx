import { SignInForm } from '@/app/(auth)/sign-in/sign-in-form';

type SignInPageProps = {
  searchParams: Promise<{ next?: string }>;
};

const SignInPage = async ({ searchParams }: SignInPageProps) => {
  const { next } = await searchParams;

  return (
    <main data-testid="sign-in-page" className="mx-auto max-w-sm px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold">Sign in</h1>
      <SignInForm next={next} />
    </main>
  );
};

export default SignInPage;

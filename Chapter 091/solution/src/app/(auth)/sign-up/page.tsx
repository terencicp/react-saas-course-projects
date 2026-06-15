import { SignUpForm } from '@/app/(auth)/sign-up/sign-up-form';

const SignUpPage = () => (
  <main data-testid="sign-up-page" className="mx-auto max-w-sm px-6 py-16">
    <h1 className="mb-6 text-2xl font-semibold">Create your account</h1>
    <SignUpForm />
  </main>
);

export default SignUpPage;

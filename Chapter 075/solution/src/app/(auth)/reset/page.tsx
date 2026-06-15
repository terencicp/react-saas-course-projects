import { ResetForm } from '@/app/(auth)/reset/reset-form';

const ResetPage = () => (
  <main data-testid="reset-page" className="mx-auto max-w-sm px-6 py-16">
    <h1 className="mb-6 text-2xl font-semibold">Reset your password</h1>
    <ResetForm />
  </main>
);

export default ResetPage;

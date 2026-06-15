import { getCurrentUser } from '@/lib/auth';

const DashboardPage = async () => {
  // Second read in the request — served from the React-cache dedupe, no extra
  // DB round trip.
  const user = await getCurrentUser();

  return (
    <section
      data-testid="dashboard-page"
      className="mx-auto max-w-2xl px-6 py-16"
    >
      <h1 className="text-2xl font-semibold">Hello {user?.name}</h1>
      <dl className="mt-6 text-sm text-muted-foreground">
        <dt className="font-medium text-foreground">Email</dt>
        <dd>{user?.email}</dd>
      </dl>
    </section>
  );
};

export default DashboardPage;

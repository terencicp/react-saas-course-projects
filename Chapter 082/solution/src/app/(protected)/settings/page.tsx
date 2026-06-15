import { ResendClientTest } from '@/app/(protected)/settings/resend-test';
import { requireUser } from '@/lib/auth';

// The settings surface. It mounts the seeded ResendClientTest client component
// (finding 5's call site). requireUser is a request-time read, so this segment ships
// a loading.tsx (the Cache Components Suspense seam).
const SettingsPage = async () => {
  const user = await requireUser('/settings');

  return (
    <section
      data-testid="settings-page"
      className="mx-auto max-w-2xl px-6 py-16"
    >
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as {user.email}
      </p>
      <div className="mt-8">
        <ResendClientTest />
      </div>
    </section>
  );
};

export default SettingsPage;

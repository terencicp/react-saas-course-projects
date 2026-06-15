import { Suspense } from 'react';

import { OrgSwitcher } from '@/app/(protected)/dashboard/org-switcher';
import { ActingUserSwitcher } from '@/app/(protected)/inspector/_components/acting-user-switcher';
import { CountersPanel } from '@/app/(protected)/inspector/_components/counters-panel';
import { FireConsole } from '@/app/(protected)/inspector/_components/fire-console';
import { InboxPanel } from '@/app/(protected)/inspector/_components/inbox-panel';
import { NotificationDebugControls } from '@/app/(protected)/inspector/_components/notification-debug-controls';
import { PrefsPanel } from '@/app/(protected)/inspector/_components/prefs-panel';
import { ProcessedEventsTail } from '@/app/(protected)/inspector/_components/processed-events-tail';
import { getNotificationInspectorContext } from '@/app/(protected)/inspector/_data';
import { Card } from '@/components/ui/card';

// The notification inspector: the verification surface for the dispatcher seam. Eight
// bounded panels, each a region with a data-testid. Request-time reads sit behind
// <Suspense>; every notification read goes through a guarded helper that returns empty
// at scaffold (the tables land with the student's S1/S2 work), so the page renders
// deterministically and never 500s — clicking a Fire button surfaces the
// `dispatch not implemented` error in the result panel without crashing the page.

const isDev = process.env.NODE_ENV !== 'production';

const Header = async () => {
  const { userId, orgId, orgName, orgs, members } =
    await getNotificationInspectorContext();

  return (
    <Card
      data-testid="inspector-header"
      className="flex flex-wrap items-center justify-between gap-4 p-4"
    >
      <div>
        <p className="text-xs uppercase text-muted-foreground">Active org</p>
        <p className="text-lg font-semibold">{orgName}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <OrgSwitcher orgs={orgs} activeOrgId={orgId} />
        {isDev && (
          <div data-testid="user-switcher">
            <ActingUserSwitcher users={members} activeUserId={userId} />
          </div>
        )}
      </div>
    </Card>
  );
};

const Prefs = async () => {
  const { prefs } = await getNotificationInspectorContext();
  return <PrefsPanel prefs={prefs} />;
};

const Inbox = async () => {
  const { inbox } = await getNotificationInspectorContext();
  return <InboxPanel rows={inbox} />;
};

const Counters = async () => {
  const { emailSentCount, dedupCount } =
    await getNotificationInspectorContext();
  return (
    <CountersPanel emailSentCount={emailSentCount} dedupCount={dedupCount} />
  );
};

const Events = async () => {
  const { processedEvents } = await getNotificationInspectorContext();
  return <ProcessedEventsTail rows={processedEvents} />;
};

const InspectorPage = () => (
  <section
    data-testid="inspector-page"
    className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10"
  >
    <h1 className="text-2xl font-semibold">Notification inspector</h1>

    <Suspense>
      <Header />
    </Suspense>

    <div className="grid gap-6 md:grid-cols-2">
      <Suspense>
        <Prefs />
      </Suspense>
      <FireConsole />
      <Suspense>
        <Inbox />
      </Suspense>
      <Suspense>
        <Counters />
      </Suspense>
      {isDev && <NotificationDebugControls />}
      <Suspense>
        <Events />
      </Suspense>
    </div>
  </section>
);

export default InspectorPage;

// A page-view tracker that fires the moment the module is imported. The network
// call lives at module top level, so a bare `import '@/lib/analytics/page-view-tracker'`
// at a render boundary fires it as an invisible side effect — review-stack
// territory, not a linter finding.
//
// The call is fully swallowed: it never throws into the importing render and never
// blocks it. There is no real endpoint, so it fails harmlessly; the surface paints
// regardless of whether the request succeeds.

const track = async (): Promise<void> => {
  try {
    await fetch('https://analytics.invalid/api/track', {
      method: 'POST',
      body: JSON.stringify({ event: 'plan_page_view' }),
    });
  } catch {
    // Swallow — the page render must not depend on this round trip.
  }
};

// Fired at module scope: importing this file has the side effect of a tracked
// page view.
void track();

export {};

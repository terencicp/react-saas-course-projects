// The segment-level Suspense seam. Under cacheComponents the inspector reads
// request-time DB data at the page body's top level; without this boundary
// `next build` fails prerendering /inspector with "Uncached data was accessed
// outside of <Suspense>". With it the route builds as a Partial Prerender
// (static shell + dynamic streamed content).
const Loading = () => (
  <main data-testid="inspector-loading" className="p-6 text-muted-foreground">
    Loading…
  </main>
);

export default Loading;

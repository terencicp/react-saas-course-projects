// Segment Suspense seam: the pro-only page awaits requirePlan (a request-time read),
// which under Cache Components needs a Suspense boundary or `next build` prerender
// fails.
const Loading = () => null;

export default Loading;

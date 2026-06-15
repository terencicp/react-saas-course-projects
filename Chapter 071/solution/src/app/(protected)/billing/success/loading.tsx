// Segment Suspense seam: the success page reads the entitlement (request-time),
// which under Cache Components needs a Suspense boundary or `next build` prerender
// fails.
const Loading = () => null;

export default Loading;

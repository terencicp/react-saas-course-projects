// Segment Suspense seam: the page reads `await searchParams` and the session, which
// under Cache Components needs a Suspense boundary or `next build` prerender fails.
const Loading = () => null;

export default Loading;

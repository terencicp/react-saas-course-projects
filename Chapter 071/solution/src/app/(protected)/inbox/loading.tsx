// Segment Suspense seam: the inbox reads request-time notification rows, which under
// Cache Components needs a Suspense boundary or `next build` prerender fails.
const Loading = () => null;

export default Loading;

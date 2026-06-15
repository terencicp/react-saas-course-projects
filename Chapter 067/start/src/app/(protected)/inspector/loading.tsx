// Segment Suspense seam: the inspector reads request-time org/member/audit data,
// which under Cache Components needs a Suspense boundary or `next build` prerender
// fails.
const Loading = () => null;

export default Loading;

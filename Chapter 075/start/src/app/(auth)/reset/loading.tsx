// Segment Suspense seam: the segment ships a loading.tsx to stay build-clean under
// Cache Components if any request-time read is added to the reset page.
const Loading = () => null;

export default Loading;

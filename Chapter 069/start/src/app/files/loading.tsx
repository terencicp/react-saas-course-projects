// Segment Suspense seam: the /files page reads request-time data ((await
// searchParams).cursor + the uncached listFiles) once L4 wires the list, which under
// Cache Components needs a Suspense boundary or `next build`'s prerender fails. Shipped
// in the scaffold so the route builds as Partial Prerender from the start.
const Loading = () => null;

export default Loading;

import { DetailSkeleton } from '@/components/skeletons';

// A slow related panel inside the detail would get its own explicit <Suspense> (Ch 031); this loading.tsx is the whole-slot seam.
const DetailLoading = () => <DetailSkeleton />;

export default DetailLoading;

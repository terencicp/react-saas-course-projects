import { UploadForm } from '@/app/files/upload-form';
import { requireOrgUser } from '@/lib/auth';

// The browser-to-R2 upload surface. One bounded region with exactly two direct children:
// the upload-form region and the files-list region — neither flattens into extra
// siblings. The list reads through tenantDb filtered to non-deleted rows and signs a
// FRESH presigned GET per row per render (never persisted, never cached). The page MUST
// NOT opt into the cache directive: a cached response would freeze the presigned URLs,
// which then expire — fresh-per-render is structural. No audit write happens in render
// (auditing is action/task-only); the route is dynamic and reads (await
// searchParams).cursor at request time, so it ships app/files/loading.tsx as its
// Suspense seam.
//
// TODO(L3) — mount UploadForm above the list; TODO(L4) — listFiles + per-row fresh getFileDownloadUrl, render file-row table + Next-page cursor link; NO audit write in render; NEVER 'use cache'

const FilesPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) => {
  await requireOrgUser();
  await searchParams;

  return (
    <section
      data-testid="files-page"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10"
    >
      <h1 className="text-2xl font-semibold">Files</h1>

      <UploadForm />

      <div data-testid="files-list" className="flex flex-col gap-2">
        <p data-testid="files-empty" className="text-sm text-muted-foreground">
          No files yet.
        </p>
      </div>
    </section>
  );
};

export default FilesPage;

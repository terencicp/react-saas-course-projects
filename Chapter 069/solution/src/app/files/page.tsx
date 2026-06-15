import type { Route } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { UploadForm } from '@/app/files/upload-form';
import { Badge } from '@/components/ui/badge';
import { getFileDownloadUrl, listFiles } from '@/db/queries/file-metadata';
import type { FileMetadata } from '@/db/schema';
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

const cursorSchema = z.string().min(1).nullable().catch(null);

// Server-observed identity at every read; deterministic so the seeded list renders the
// same on every paint. Bytes are humanized for the row; the time is a fixed UTC string
// off the plain Date at the timestamptz boundary.
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
};

const formatUploadedAt = (uploadedAt: Date): string =>
  uploadedAt.toISOString().slice(0, 16).replace('T', ' ');

const FileRow = async ({
  orgId,
  file,
}: {
  orgId: string;
  file: FileMetadata;
}) => {
  // A fresh presigned GET, minted per row per render — never read from a stored column.
  const download = await getFileDownloadUrl(orgId, file.id);

  return (
    <div
      data-testid="file-row"
      className="flex items-center justify-between gap-4 rounded-lg border border-input px-4 py-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span data-testid="file-name" className="truncate font-medium">
          {file.originalFileName}
        </span>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge data-testid="file-type-badge" variant="secondary">
            {file.contentType}
          </Badge>
          <span data-testid="file-size">{formatBytes(file.byteSize)}</span>
          <span>{formatUploadedAt(file.uploadedAt)}</span>
        </div>
      </div>

      {download.ok ? (
        <a
          data-testid="download-link"
          href={download.data.url}
          className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Download
        </a>
      ) : null}
    </div>
  );
};

const FilesPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) => {
  const { orgId } = await requireOrgUser();
  const cursor = cursorSchema.parse((await searchParams).cursor ?? null);
  const { rows, nextCursor } = await listFiles({ orgId, cursor });

  return (
    <section
      data-testid="files-page"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10"
    >
      <h1 className="text-2xl font-semibold">Files</h1>

      <UploadForm />

      <div data-testid="files-list" className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p
            data-testid="files-empty"
            className="text-sm text-muted-foreground"
          >
            No files yet.
          </p>
        ) : (
          rows.map((file) => (
            <FileRow key={file.id} orgId={orgId} file={file} />
          ))
        )}

        {nextCursor ? (
          <Link
            data-testid="files-next"
            href={`/files?cursor=${encodeURIComponent(nextCursor)}` as Route}
            className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Next page
          </Link>
        ) : null}
      </div>
    </section>
  );
};

export default FilesPage;

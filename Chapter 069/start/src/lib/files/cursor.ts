import { z } from 'zod';

// The /files keyset cursor: the (uploadedAt, id) of the last row of the previous page,
// base64url-encoded JSON. Its own codec rather than the invoices' createdAt-only cursor
// — the file_metadata keyset is the composite (uploadedAt desc, id desc) the index
// serves, so the cursor must carry both columns to break ties deterministically. The
// payload is Zod-validated on decode: a tampered/garbage cursor parses to null and the
// list falls back to the first page, never throwing on a hostile querystring.
const cursorSchema = z.strictObject({
  uploadedAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

export type FileCursor = z.infer<typeof cursorSchema>;

export const encodeCursor = (cursor: FileCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

export const decodeCursor = (raw: string | null): FileCursor | null => {
  if (!raw) {
    return null;
  }
  try {
    const json: unknown = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    );
    const parsed = cursorSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

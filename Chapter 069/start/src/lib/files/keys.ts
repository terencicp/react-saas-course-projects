import type { ALLOWED_CONTENT_TYPES } from '@/lib/r2';

type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

// The extension comes from the VALIDATED content type, never the user filename — a
// `.exe` renamed `.png` cannot smuggle its real extension into the key. Static map,
// exhaustive over the allowlist, so adding a type without an extension is a tsc error.
const EXT_FOR: Record<AllowedContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/csv': 'csv',
};

export const extFor = (contentType: AllowedContentType): string =>
  EXT_FOR[contentType];

// The server-constructed object key. Built from the org and a server-generated UUIDv7
// (the fileId) — never anything the client sends, because a client-chosen key is the
// tenancy-bypass shape (a crafted value could target another org's prefix). The
// `files/` segment carries the user-upload half of the one-bucket-two-prefixes split.
export const buildObjectKey = ({
  orgId,
  fileId,
  contentType,
}: {
  orgId: string;
  fileId: string;
  contentType: AllowedContentType;
}): string => `org/${orgId}/files/${fileId}.${extFor(contentType)}`;

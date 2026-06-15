'use client';

// The browser-to-R2 upload surface. Drives the two-step write from the client: sign →
// XHR PUT straight to R2 → finalize. The multi-MB body never crosses a Server Action —
// only the small JSON does. On success, router.refresh() re-renders the list.
//
// TODO(L3) — file input (accept allowlist) + status state + progress; presignedPut → XMLHttpRequest PUT (Content-Type header, xhr.upload.onprogress) → finalizeUpload → router.refresh()
export const UploadForm = () => <div data-testid="upload-form" />;

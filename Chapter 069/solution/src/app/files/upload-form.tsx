'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { finalizeUpload } from '@/lib/files/finalize';
import { presignedPut } from '@/lib/files/presigned-put';

type UploadStatus =
  | 'idle'
  | 'signing'
  | 'uploading'
  | 'finalizing'
  | 'done'
  | 'failed';

// Client-local mirrors of the server allowlist + cap. The authoritative copies live in
// the server-only lib/r2.ts (which a Client Component cannot import — the poison pill),
// and the action re-validates against them. These drive the instant client pre-checks
// only — defense-in-depth for feedback, never the security boundary.
const ALLOWED_CLIENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/csv',
] as const;
const MAX_BYTES = 25 * 1024 * 1024;

const ACCEPT = ALLOWED_CLIENT_TYPES.join(',');

const isAllowedType = (
  type: string,
): type is (typeof ALLOWED_CLIENT_TYPES)[number] =>
  (ALLOWED_CLIENT_TYPES as readonly string[]).includes(type);

// The PUT goes over XMLHttpRequest, not fetch — XHR is the one tool that exposes
// `xhr.upload.onprogress`, which drives the bar. It sends the EXACT Content-Type that
// was signed; a normalized type (the `.JPG`→`image/pjpeg` trap) surfaces as a
// 403 SignatureDoesNotMatch.
const putToR2 = (
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed.'));
    xhr.send(file);
  });

// The browser-to-R2 upload surface. Drives the two-step write from the client: sign →
// XHR PUT straight to R2 → finalize. The multi-MB body never crosses a Server Action
// — only the small JSON does. Client-side size/type pre-checks are defense-in-depth
// for instant feedback, not the server boundary (the action re-validates and the HEAD
// reads the true size). On success, router.refresh() re-renders the list (no client
// cache, no store — plain React state + XHR).
export const UploadForm = () => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!input || !file) {
      setError('Pick a file to upload.');
      return;
    }
    if (!isAllowedType(file.type)) {
      setError('That file type is not supported.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That file is larger than the 25 MB limit.');
      return;
    }

    setProgress(0);
    setStatus('signing');

    const signFd = new FormData();
    signFd.set('fileName', file.name);
    signFd.set('contentType', file.type);
    signFd.set('claimedSize', String(file.size));
    const signed = await presignedPut(null, signFd);
    if (!signed.ok) {
      setStatus('failed');
      setError(signed.error.userMessage);
      return;
    }

    setStatus('uploading');
    try {
      await putToR2(signed.data.url, file, setProgress);
    } catch (e) {
      setStatus('failed');
      setError(e instanceof Error ? e.message : 'Upload failed.');
      return;
    }

    setStatus('finalizing');
    const finalizeFd = new FormData();
    finalizeFd.set('uploadId', signed.data.uploadId);
    finalizeFd.set('objectKey', signed.data.objectKey);
    finalizeFd.set('originalFileName', file.name);
    finalizeFd.set('contentType', file.type);
    const finalized = await finalizeUpload(null, finalizeFd);
    if (!finalized.ok) {
      setStatus('failed');
      setError(finalized.error.userMessage);
      return;
    }

    setStatus('done');
    input.value = '';
    router.refresh();
  };

  const busy =
    status === 'signing' || status === 'uploading' || status === 'finalizing';

  return (
    <form
      data-testid="upload-form"
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-lg border border-input p-4"
    >
      <Input
        ref={fileInputRef}
        type="file"
        name="file"
        accept={ACCEPT}
        data-testid="file-input"
        disabled={busy}
      />

      <div className="flex flex-col gap-2">
        <Progress data-testid="upload-progress" value={progress} />
        <p
          data-testid="upload-status"
          className="text-sm text-muted-foreground"
        >
          {status}
        </p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="submit" data-testid="upload-submit" disabled={busy}>
        Upload
      </Button>
    </form>
  );
};

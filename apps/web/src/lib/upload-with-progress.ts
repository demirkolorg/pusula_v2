/**
 * `XMLHttpRequest`-based PUT with upload progress + cancellation.
 *
 * `fetch` cannot report upload progress, so the two-phase attachment upload
 * (`initiate` → presigned PUT → `commit`) drives the PUT through a raw
 * `XMLHttpRequest`. The xhr is surfaced via {@link UploadHandle.abort} so the
 * caller can cancel an in-flight upload (explicit "İptal" button or component
 * unmount). Pure + framework-free so it is unit-testable.
 *
 * Spec: `docs/architecture/13-ui-tasarim-dili.md` §13.10.1.
 */

/** Handle returned by {@link uploadWithProgress} — the promise plus an aborter. */
export interface UploadHandle {
  /** Resolves on a 2xx PUT, rejects on network error / non-2xx / abort. */
  promise: Promise<void>;
  /** Cancels the in-flight request. Safe to call after completion (no-op). */
  abort: () => void;
}

/** Error thrown when an upload is cancelled via {@link UploadHandle.abort}. */
export class UploadAbortedError extends Error {
  constructor() {
    super('upload aborted');
    this.name = 'UploadAbortedError';
  }
}

/**
 * Start a presigned PUT of `file` to `url`. Returns immediately with an
 * {@link UploadHandle}; `headers` are forwarded except `Content-Length` (the
 * browser sets that from the body and rejects an override).
 */
export function uploadWithProgress(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (percent: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  let settled = false;

  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', url);
    for (const [key, value] of Object.entries(headers)) {
      // `Content-Length` is set by the browser from the body and cannot be
      // overridden; skip it so the XHR send doesn't throw.
      if (key.toLowerCase() === 'content-length') continue;
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    xhr.addEventListener('load', () => {
      settled = true;
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload failed: ${xhr.status}`));
    });
    xhr.addEventListener('error', () => {
      settled = true;
      reject(new Error('upload failed'));
    });
    xhr.addEventListener('abort', () => {
      settled = true;
      reject(new UploadAbortedError());
    });
    xhr.send(file);
  });

  return {
    promise,
    abort: () => {
      if (!settled) xhr.abort();
    },
  };
}

/**
 * Resolves a post-auth redirect target to a *safe in-app path*, or `fallback`
 * (default `'/'`) when the input isn't a local path.
 *
 * Blocks open-redirect vectors: protocol-relative URLs (`//evil.com`),
 * backslash-escaped variants (`/\evil.com`), and absolute / scheme URLs
 * (`https://…`, `javascript:…`). Only a value that starts with a single `/` is
 * accepted, and even then the origin is stripped via `URL` so an embedded host
 * can't leak through. The caller-side validation matters because `?redirect=`
 * is attacker-controllable even though the app only ever writes safe paths.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  try {
    const url = new URL(raw, 'http://localhost');
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

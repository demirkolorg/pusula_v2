/**
 * Faz 9D (DEM-130) — misafir paylaşım sayfası.
 *
 *   /share/[token]
 *
 * SSR App Router sayfası. Server-side `fetch ${env.NEXT_PUBLIC_API_URL}/share/${token}`
 * çağrısı yapar; 200 → snapshot render, 404/410 → Türkçe hata sayfası. App
 * shell DEĞİL — sade public layout (`layout.tsx`). HTML head'inde
 * `robots: noindex,nofollow`; SSR response'unda `Referrer-Policy: no-referrer`
 * `apps/api` zaten set ediyor (HTML wrapper sade JSON tüketim).
 *
 * Bkz. `docs/architecture/14-paylasim-linki-mimarisi.md` "UI dokunuşu" +
 * `docs/domain/08-paylasim-linki-kurallari.md` "Misafir görme yetkisi".
 */
import type { Metadata } from 'next';
import { env } from '@/env';
import { strings } from '@/lib/strings';
import { ShareCardView, type ShareSnapshot } from './_components/share-card-view';
import { ShareErrorView, type ShareGoneReason } from './_components/share-error-view';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: strings.share.guest.sharedWithYou,
  robots: { index: false, follow: false },
};

type LookupResult =
  | { ok: true; snapshot: ShareSnapshot }
  | { ok: false; status: 404 }
  | { ok: false; status: 410; reason: ShareGoneReason };

async function fetchShareSnapshot(token: string): Promise<LookupResult> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(token)) {
    return { ok: false, status: 404 };
  }
  let res: Response;
  try {
    res = await fetch(`${env.NEXT_PUBLIC_API_URL}/share/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
  } catch {
    return { ok: false, status: 404 };
  }
  if (res.status === 404) return { ok: false, status: 404 };
  if (res.status === 410) {
    const body = (await res.json().catch(() => null)) as { reason?: string } | null;
    const reason = (body?.reason ?? 'revoked') as ShareGoneReason;
    return { ok: false, status: 410, reason };
  }
  if (!res.ok) return { ok: false, status: 404 };
  const snapshot = (await res.json()) as ShareSnapshot;
  return { ok: true, snapshot };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await fetchShareSnapshot(token);

  if (!result.ok) {
    return (
      <ShareErrorView
        status={result.status}
        reason={result.status === 410 ? result.reason : null}
      />
    );
  }

  return <ShareCardView token={token} snapshot={result.snapshot} apiUrl={env.NEXT_PUBLIC_API_URL} />;
}

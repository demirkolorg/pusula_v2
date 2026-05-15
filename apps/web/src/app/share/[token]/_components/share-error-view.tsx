/**
 * Faz 9D (DEM-130) — misafir paylaşım sayfası 404 / 410 hata görünümü.
 * `reason` 4 olası değer (`docs/architecture/14-paylasim-linki-mimarisi.md`).
 */
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle, Button } from '@pusula/ui';
import { strings } from '@/lib/strings';

export type ShareGoneReason = 'revoked' | 'expired' | 'cardArchived' | 'cardDeleted';

type ShareErrorViewProps = {
  status: 404 | 410;
  reason: ShareGoneReason | null;
};

function errorTitle(status: 404 | 410, reason: ShareGoneReason | null): string {
  const copy = strings.share.error;
  if (status === 404) return copy.titleNotFound;
  switch (reason) {
    case 'revoked':
      return copy.titleRevoked;
    case 'expired':
      return copy.titleExpired;
    case 'cardArchived':
      return copy.titleCardArchived;
    case 'cardDeleted':
      return copy.titleCardDeleted;
    default:
      return copy.titleGeneric;
  }
}

export function ShareErrorView({ status, reason }: ShareErrorViewProps) {
  const copy = strings.share.error;
  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <AlertTitle>{errorTitle(status, reason)}</AlertTitle>
        <AlertDescription>{copy.description}</AlertDescription>
      </Alert>
      <Link href="/">
        <Button variant="outline">{copy.backHome}</Button>
      </Link>
    </div>
  );
}

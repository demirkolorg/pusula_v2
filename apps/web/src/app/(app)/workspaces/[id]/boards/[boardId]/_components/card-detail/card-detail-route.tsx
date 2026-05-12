'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { CardDetailDialog } from './card-detail-dialog';

/**
 * Glue between the URL and the card detail modal: reads `?card=<id>` from the
 * search params and, when present, renders {@link CardDetailDialog} on top of
 * the board screen. Closing the modal `router.push`es back, dropping only the
 * `?card` param (any other query params are preserved), keeping scroll. Must be
 * rendered inside a `<Suspense>` boundary (App Router requirement for
 * `useSearchParams`).
 */
export function CardDetailRoute({ boardId }: { boardId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = authClient.useSession();

  const cardId = searchParams.get('card');
  if (!cardId) return null;

  // Wait for the session so we have the viewer's user id (self-watch / "you").
  const viewerUserId = session.data?.user?.id;
  if (!viewerUserId) return null;

  const close = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('card');
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <CardDetailDialog boardId={boardId} cardId={cardId} viewerUserId={viewerUserId} onClose={close} />
  );
}

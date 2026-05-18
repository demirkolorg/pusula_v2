/**
 * DEM-205 — Hızlı Not → kart dönüşümü mutation'ı (web panel sürükle-bırak).
 *
 * Bir Hızlı Not pano listesine sürüklenip bırakılınca tetiklenir. `convertToCard`
 * tek transaction'da kartı oluşturur ve notu siler; konum (`beforeCardId` /
 * `afterCardId` / `newPosition`) sürüklemenin bırakıldığı yere göre `use-board-dnd`
 * tarafından hesaplanır (`planQuickNoteConvert`).
 *
 * Optimistic: not `quickNote.list` cache'inden anında düşer. `onError` notu geri
 * koyar + `toast.error`. `onSettled` `quickNote.list` **ve** `board.get`
 * invalidate eder — oluşan kart panoda belirir (kullanıcı kararı: dönüşüm sonrası
 * panoda kalınır, navigasyon yok). Kart `board.get`'e optimistic eklenmez (ağır
 * `BoardCard` şekli) — `card.created` realtime event'i + invalidate yeterli.
 *
 * Her çağrı `clientMutationId` taşır (backend idempotent — duplicate kart yok).
 */
'use client';

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@pusula/ui';
import { useBoardCacheKeys } from '@/lib/board-cache';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';
import type { QuickNote } from './use-quick-note-mutations';

/** `convert` çağrı argümanları — konum alanları sürükle-bırak planından gelir. */
export type QuickNoteConvertVars = {
  noteId: string;
  listId: string;
  beforeCardId?: string | null;
  afterCardId?: string | null;
  newPosition?: string;
};

export function useQuickNoteConvert(boardId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const cacheKeys = useBoardCacheKeys();
  const listKey = trpc.quickNote.list.queryKey();
  const listFilter = trpc.quickNote.list.queryFilter();

  const mutation = useMutation(
    trpc.quickNote.convertToCard.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(listFilter);
        const previous = queryClient.getQueryData(listKey);
        if (previous) {
          queryClient.setQueryData<QuickNote[]>(
            listKey,
            previous.filter((note) => note.id !== vars.noteId),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
        toast.error(strings.board.quickNotes.convertError);
      },
      onSettled: async () => {
        await queryClient.invalidateQueries(listFilter);
        await queryClient.invalidateQueries(cacheKeys.board(boardId));
      },
    }),
  );

  const { mutate } = mutation;
  const convert = useCallback(
    (vars: QuickNoteConvertVars) => {
      mutate({
        noteId: vars.noteId,
        listId: vars.listId,
        beforeCardId: vars.beforeCardId ?? undefined,
        afterCardId: vars.afterCardId ?? undefined,
        newPosition: vars.newPosition,
        clientMutationId: crypto.randomUUID(),
      });
    },
    [mutate],
  );

  return { convert, isPending: mutation.isPending };
}

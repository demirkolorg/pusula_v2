/**
 * Faz 7H — kart detay ekranı collaborative mutation'ları: başlık güncelleme ve
 * "move to list" ile kart taşıma. Faz 7G-2 (DEM-195) kartı tamamla / geri al
 * mutation'larını, DEM-196 kart arşivlemeyi ekler.
 *
 * Optimistic akış: `onMutate` `card.get` cache'ini iyimser günceller + (board
 * ekranı cache'te ise) `board.get`'i de `moveCardInCache` ile günceller,
 * snapshot tutar; `onError` snapshot'lara geri sarar + `Alert`; `onSettled`
 * `card.get` ve `board.get`'i invalidate eder. Her mutation `clientMutationId`
 * taşır. Başlık dışı temel alanlar (açıklama/due/etiket/üye) Faz 7G kapsamında.
 */
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { moveCardInCache, removeCardFromCache, renameCardInCache } from '@/lib/board-cache';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';

export function useCardMutations(cardId: string, boardId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const cardKey = trpc.card.get.queryKey({ cardId });
  const cardFilter = trpc.card.get.queryFilter({ cardId });
  const boardKey = trpc.board.get.queryKey({ boardId });
  const boardFilter = trpc.board.get.queryFilter({ boardId });

  const fail = () => Alert.alert(strings.common.errorTitle, strings.common.actionError);
  const invalidate = () => {
    void queryClient.invalidateQueries(cardFilter);
    void queryClient.invalidateQueries(boardFilter);
  };

  // --- Başlık güncelleme ----------------------------------------------------
  // `card.get` ve (cache'te ise) `board.get` birlikte iyimser güncellenir —
  // kullanıcı board'a döndüğünde kart yüzü eski başlığı göstermesin.
  const updateTitleMutation = useMutation(
    trpc.card.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(cardFilter);
        await queryClient.cancelQueries(boardFilter);
        const previousCard = queryClient.getQueryData(cardKey);
        const previousBoard = queryClient.getQueryData(boardKey);
        if (previousCard && vars.title !== undefined) {
          queryClient.setQueryData(cardKey, {
            ...previousCard,
            card: { ...previousCard.card, title: vars.title },
          });
        }
        if (previousBoard && vars.title !== undefined) {
          queryClient.setQueryData(
            boardKey,
            renameCardInCache(previousBoard, vars.cardId, vars.title),
          );
        }
        return { previousCard, previousBoard };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previousCard) queryClient.setQueryData(cardKey, ctx.previousCard);
        if (ctx?.previousBoard) queryClient.setQueryData(boardKey, ctx.previousBoard);
        fail();
      },
      onSettled: invalidate,
    }),
  );

  // --- Kart taşıma ("move to list") ----------------------------------------
  const moveCardMutation = useMutation(
    trpc.card.moveToList.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(cardFilter);
        await queryClient.cancelQueries(boardFilter);
        const previousCard = queryClient.getQueryData(cardKey);
        const previousBoard = queryClient.getQueryData(boardKey);
        if (previousCard) {
          queryClient.setQueryData(cardKey, {
            ...previousCard,
            card: { ...previousCard.card, listId: vars.toListId },
          });
        }
        if (previousBoard) {
          queryClient.setQueryData(
            boardKey,
            moveCardInCache(previousBoard, vars.cardId, vars.toListId),
          );
        }
        return { previousCard, previousBoard };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previousCard) queryClient.setQueryData(cardKey, ctx.previousCard);
        if (ctx?.previousBoard) queryClient.setQueryData(boardKey, ctx.previousBoard);
        fail();
      },
      onSettled: invalidate,
    }),
  );

  // --- Kartı tamamla / geri al (Faz 7G-2 — DEM-195) ------------------------
  // `card.get` cache'i iyimser güncellenir (kart detayı anında yansır). Board
  // `board.get` cache'i burada *yamanmaz* — kart yüzünün `completedBy`/`At`
  // alanları çağıranın kimliğini gerektirir; `onSettled` board invalidate'i
  // kart yüzünü arka planda tazeler (kullanıcı board'a döndüğünde doğru).
  const completeOnMutate = (completed: boolean) => async () => {
    await queryClient.cancelQueries(cardFilter);
    const previousCard = queryClient.getQueryData(cardKey);
    if (previousCard) {
      queryClient.setQueryData(cardKey, {
        ...previousCard,
        card: { ...previousCard.card, completed },
      });
    }
    return { previousCard };
  };

  const completeMutation = useMutation(
    trpc.card.complete.mutationOptions({
      onMutate: completeOnMutate(true),
      onError: (_error, _vars, ctx) => {
        if (ctx?.previousCard) queryClient.setQueryData(cardKey, ctx.previousCard);
        fail();
      },
      onSettled: invalidate,
    }),
  );

  const uncompleteMutation = useMutation(
    trpc.card.uncomplete.mutationOptions({
      onMutate: completeOnMutate(false),
      onError: (_error, _vars, ctx) => {
        if (ctx?.previousCard) queryClient.setQueryData(cardKey, ctx.previousCard);
        fail();
      },
      onSettled: invalidate,
    }),
  );

  // --- Kartı arşivle (DEM-196) ---------------------------------------------
  // `card.get` `archivedAt` iyimser set edilir; `board.get` cache'inden kart
  // `removeCardFromCache` ile düşürülür (board ekranı yalnız aktif kart tutar).
  // Ekran arşivleme sonrası `router.back()` ile board'a döner — bu mutation'ın
  // callback'leri ekran unmount olsa da çalışır (TanStack Query mutation'ı
  // observer'dan bağımsız tamamlanır).
  const archiveMutation = useMutation(
    trpc.card.archive.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(cardFilter);
        await queryClient.cancelQueries(boardFilter);
        const previousCard = queryClient.getQueryData(cardKey);
        const previousBoard = queryClient.getQueryData(boardKey);
        if (previousCard) {
          queryClient.setQueryData(cardKey, {
            ...previousCard,
            card: { ...previousCard.card, archivedAt: new Date() },
          });
        }
        if (previousBoard) {
          queryClient.setQueryData(boardKey, removeCardFromCache(previousBoard, vars.cardId));
        }
        return { previousCard, previousBoard };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previousCard) queryClient.setQueryData(cardKey, ctx.previousCard);
        if (ctx?.previousBoard) queryClient.setQueryData(boardKey, ctx.previousBoard);
        Alert.alert(strings.common.errorTitle, strings.cardDetail.archiveError);
      },
      onSettled: invalidate,
    }),
  );

  return {
    updateTitle: (title: string) => {
      updateTitleMutation.mutate({ cardId, title, clientMutationId: newClientMutationId() });
    },
    moveToList: (toListId: string) => {
      moveCardMutation.mutate({ cardId, toListId, clientMutationId: newClientMutationId() });
    },
    /** Mevcut tamamlanma durumuna göre `card.complete` ya da `uncomplete` çağırır. */
    toggleComplete: (currentlyCompleted: boolean) => {
      const mutation = currentlyCompleted ? uncompleteMutation : completeMutation;
      mutation.mutate({ cardId, clientMutationId: newClientMutationId() });
    },
    /** Tamamla/geri al uçuşta — toggle çift gönderimi engellenir. */
    completePending: completeMutation.isPending || uncompleteMutation.isPending,
    /** Kartı arşivler (DEM-196) — board görünümünden düşer. */
    archive: () => {
      archiveMutation.mutate({ cardId, archived: true, clientMutationId: newClientMutationId() });
    },
  };
}

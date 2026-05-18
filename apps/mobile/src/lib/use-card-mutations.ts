/**
 * Faz 7H — kart detay ekranı collaborative mutation'ları: başlık güncelleme ve
 * "move to list" ile kart taşıma.
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
import { moveCardInCache, renameCardInCache } from '@/lib/board-cache';
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

  return {
    updateTitle: (title: string) => {
      updateTitleMutation.mutate({ cardId, title, clientMutationId: newClientMutationId() });
    },
    moveToList: (toListId: string) => {
      moveCardMutation.mutate({ cardId, toListId, clientMutationId: newClientMutationId() });
    },
  };
}

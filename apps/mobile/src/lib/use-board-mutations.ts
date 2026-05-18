/**
 * Faz 7H — board ekranı collaborative mutation'ları (kart/liste oluştur, liste
 * yeniden adlandır/arşivle, kart taşı). DEM-211 board-seviyesi yeniden
 * adlandırma/arşivlemeyi (`board.update` / `board.archive`) ekler.
 *
 * Hepsi TanStack Query optimistic akışında çalışır: `onMutate` `board.get`
 * cache'ini iyimser günceller (saf `board-cache` dönüşümleriyle) + snapshot
 * tutar, `onError` snapshot'a geri sarar + `Alert` gösterir, `onSettled`
 * `board.get`'i invalidate eder (server kesin `position` ile reconcile). Her
 * mutation opsiyonel `clientMutationId` taşır (`expo-crypto` UUID). Yeni
 * kart/liste için geçici `tmp-` id'si `onSuccess`'te gerçek satırla değişir.
 */
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import {
  addOptimisticCard,
  addOptimisticList,
  archiveBoardInCache,
  archiveListInCache,
  moveCardInCache,
  renameBoardInCache,
  renameListInCache,
  replaceOptimisticCard,
  replaceOptimisticList,
} from '@/lib/board-cache';
import { newClientMutationId, newTempId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';

export function useBoardMutations(boardId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const boardKey = trpc.board.get.queryKey({ boardId });
  const boardFilter = trpc.board.get.queryFilter({ boardId });

  const fail = () => Alert.alert(strings.common.errorTitle, strings.common.actionError);
  const invalidateBoard = () => {
    void queryClient.invalidateQueries(boardFilter);
  };

  // --- Kart oluşturma -------------------------------------------------------
  const createCardMutation = useMutation(
    trpc.card.create.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(boardFilter);
        const previous = queryClient.getQueryData(boardKey);
        const tempId = newTempId();
        if (previous) {
          queryClient.setQueryData(
            boardKey,
            addOptimisticCard(previous, { listId: vars.listId, tempId, title: vars.title }),
          );
        }
        return { previous, tempId };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(boardKey, ctx.previous);
        fail();
      },
      onSuccess: (created, _vars, ctx) => {
        const current = queryClient.getQueryData(boardKey);
        if (current && ctx) {
          queryClient.setQueryData(boardKey, replaceOptimisticCard(current, ctx.tempId, created));
        }
      },
      onSettled: invalidateBoard,
    }),
  );

  // --- Liste oluşturma ------------------------------------------------------
  const createListMutation = useMutation(
    trpc.list.create.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(boardFilter);
        const previous = queryClient.getQueryData(boardKey);
        const tempId = newTempId();
        if (previous) {
          queryClient.setQueryData(
            boardKey,
            addOptimisticList(previous, { tempId, title: vars.title }),
          );
        }
        return { previous, tempId };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(boardKey, ctx.previous);
        fail();
      },
      onSuccess: (created, _vars, ctx) => {
        const current = queryClient.getQueryData(boardKey);
        if (current && ctx) {
          queryClient.setQueryData(boardKey, replaceOptimisticList(current, ctx.tempId, created));
        }
      },
      onSettled: invalidateBoard,
    }),
  );

  // --- Liste yeniden adlandırma --------------------------------------------
  const renameListMutation = useMutation(
    trpc.list.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(boardFilter);
        const previous = queryClient.getQueryData(boardKey);
        if (previous && vars.title !== undefined) {
          queryClient.setQueryData(boardKey, renameListInCache(previous, vars.listId, vars.title));
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(boardKey, ctx.previous);
        fail();
      },
      onSettled: invalidateBoard,
    }),
  );

  // --- Liste arşivleme ------------------------------------------------------
  const archiveListMutation = useMutation(
    trpc.list.archive.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(boardFilter);
        const previous = queryClient.getQueryData(boardKey);
        if (previous) {
          queryClient.setQueryData(boardKey, archiveListInCache(previous, vars.listId));
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(boardKey, ctx.previous);
        fail();
      },
      onSettled: invalidateBoard,
    }),
  );

  // --- Kart taşıma ("move to list") ----------------------------------------
  const moveCardMutation = useMutation(
    trpc.card.moveToList.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(boardFilter);
        const previous = queryClient.getQueryData(boardKey);
        if (previous) {
          queryClient.setQueryData(boardKey, moveCardInCache(previous, vars.cardId, vars.toListId));
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(boardKey, ctx.previous);
        fail();
      },
      onSettled: invalidateBoard,
    }),
  );

  // --- Board yeniden adlandırma (DEM-211) ----------------------------------
  // `board.get` cache'i iyimser yamanır; board ekranı nav başlığını kendi
  // local state'inden çizdiği için ekran de eşzamanlı tazelenir (çağıran taraf).
  const renameBoardMutation = useMutation(
    trpc.board.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(boardFilter);
        const previous = queryClient.getQueryData(boardKey);
        if (previous && vars.title !== undefined) {
          queryClient.setQueryData(boardKey, renameBoardInCache(previous, vars.title));
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(boardKey, ctx.previous);
        fail();
      },
      onSettled: invalidateBoard,
    }),
  );

  // --- Board arşivleme (DEM-211) -------------------------------------------
  // `board.get` cache'i iyimser `archivedAt` set edilir; ekran arşivleme
  // sonrası `router.back()` ile board listesine döner — mutation callback'leri
  // ekran unmount olsa da çalışır (TanStack Query observer'dan bağımsız).
  const archiveBoardMutation = useMutation(
    trpc.board.archive.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries(boardFilter);
        const previous = queryClient.getQueryData(boardKey);
        if (previous) {
          queryClient.setQueryData(boardKey, archiveBoardInCache(previous));
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(boardKey, ctx.previous);
        Alert.alert(strings.common.errorTitle, strings.board.archiveBoardError);
      },
      onSettled: invalidateBoard,
    }),
  );

  return {
    createCard: (listId: string, title: string) => {
      createCardMutation.mutate({ listId, title, clientMutationId: newClientMutationId() });
    },
    createList: (title: string) => {
      createListMutation.mutate({ boardId, title, clientMutationId: newClientMutationId() });
    },
    renameList: (listId: string, title: string) => {
      renameListMutation.mutate({ boardId, listId, title, clientMutationId: newClientMutationId() });
    },
    archiveList: (listId: string) => {
      archiveListMutation.mutate({
        boardId,
        listId,
        archived: true,
        clientMutationId: newClientMutationId(),
      });
    },
    moveCard: (cardId: string, toListId: string) => {
      moveCardMutation.mutate({ cardId, toListId, clientMutationId: newClientMutationId() });
    },
    /** Board başlığını günceller (DEM-211). */
    renameBoard: (title: string) => {
      renameBoardMutation.mutate({ boardId, title, clientMutationId: newClientMutationId() });
    },
    /** Board'u arşivler (DEM-211) — board listesine geri dönülür. */
    archiveBoard: () => {
      archiveBoardMutation.mutate({
        boardId,
        archived: true,
        clientMutationId: newClientMutationId(),
      });
    },
  };
}

/**
 * DEM-203 WP3/WP4 — Hızlı Notlar ekranı optimistic mutation'ları (oluştur /
 * düzenle / sil / not→kart dönüşümü).
 *
 * Hepsi TanStack Query optimistic akışında çalışır: `onMutate` `quickNote.list`
 * cache'ini iyimser günceller + snapshot tutar, `onError` snapshot'a geri sarar
 * + `Alert` gösterir, `onSettled` `quickNote.list`'i invalidate eder (server
 * `createdAt`/`updatedAt` ile reconcile). Yeni not için geçici `tmp-` id'si
 * `onSuccess`'te gerçek satırla değişir.
 *
 * Hızlı Not kişiseldir — rol / `canEdit` gate'i yok; sahibi her zaman düzenler.
 * `convertToCard` `clientMutationId` taşır (`card.create` ile aynı yan etkiler,
 * backend tarafı idempotent); oluşturma/düzenleme/silme işbirlikçi değil.
 */
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { newClientMutationId, newTempId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';

/** `quickNote.list`'in döndürdüğü tek not satırı. */
export type QuickNote = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/** `convertToCard` başarılı olduğunda dönen kartın navigasyon için gereken kısmı. */
export type ConvertedCard = {
  id: string;
  title: string;
};

export function useQuickNoteMutations() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listKey = trpc.quickNote.list.queryKey();
  const listFilter = trpc.quickNote.list.queryFilter();

  const fail = (message: string) => Alert.alert(strings.common.errorTitle, message);
  const invalidate = () => {
    void queryClient.invalidateQueries(listFilter);
  };

  // --- Not oluşturma --------------------------------------------------------
  // İyimser `tmp-` id'li not listenin en üstüne eklenir (router `desc(createdAt)`
  // döndürür); `onSuccess`'te gerçek satırla değişir.
  const createMutation = useMutation(
    trpc.quickNote.create.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(listFilter);
        const previous = queryClient.getQueryData(listKey);
        const tempId = newTempId();
        const now = new Date();
        const optimistic: QuickNote = {
          id: tempId,
          content: vars.content,
          createdAt: now,
          updatedAt: now,
        };
        queryClient.setQueryData(listKey, [optimistic, ...(previous ?? [])]);
        return { previous, tempId };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
        fail(strings.common.actionError);
      },
      onSuccess: (created, _vars, ctx) => {
        const current = queryClient.getQueryData(listKey);
        if (current && ctx) {
          queryClient.setQueryData(
            listKey,
            current.map((note) => (note.id === ctx.tempId ? created : note)),
          );
        }
      },
      onSettled: invalidate,
    }),
  );

  // --- Not düzenleme --------------------------------------------------------
  const updateMutation = useMutation(
    trpc.quickNote.update.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(listFilter);
        const previous = queryClient.getQueryData(listKey);
        if (previous) {
          queryClient.setQueryData(
            listKey,
            previous.map((note) =>
              note.id === vars.noteId
                ? { ...note, content: vars.content, updatedAt: new Date() }
                : note,
            ),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
        fail(strings.common.actionError);
      },
      onSettled: invalidate,
    }),
  );

  // --- Not silme ------------------------------------------------------------
  const deleteMutation = useMutation(
    trpc.quickNote.delete.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(listFilter);
        const previous = queryClient.getQueryData(listKey);
        if (previous) {
          queryClient.setQueryData(
            listKey,
            previous.filter((note) => note.id !== vars.noteId),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
        fail(strings.common.actionError);
      },
      onSettled: invalidate,
    }),
  );

  // --- Not → kart dönüşümü (WP4) -------------------------------------------
  // İyimser olarak not listeden düşer; `onSuccess`'te oluşan kart `onConverted`
  // callback'i ile çağrana iletilir (kart detayına navigasyon). `onError`'da
  // not geri eklenir + `Alert`. Backend not silme + kart oluşturmayı tek
  // transaction'da yapar — `clientMutationId` taşır.
  const convertMutation = useMutation(
    trpc.quickNote.convertToCard.mutationOptions({
      onMutate: async (vars) => {
        await queryClient.cancelQueries(listFilter);
        const previous = queryClient.getQueryData(listKey);
        if (previous) {
          queryClient.setQueryData(
            listKey,
            previous.filter((note) => note.id !== vars.noteId),
          );
        }
        return { previous };
      },
      onError: (_error, _vars, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
        fail(strings.quickNotes.convertError);
      },
      onSettled: invalidate,
    }),
  );

  return {
    createNote: (content: string) => {
      createMutation.mutate({ content });
    },
    updateNote: (noteId: string, content: string) => {
      updateMutation.mutate({ noteId, content });
    },
    deleteNote: (noteId: string) => {
      deleteMutation.mutate({ noteId });
    },
    /**
     * Notu `listId`'deki bir karta dönüştürür. Başarılı olunca `onConverted`
     * oluşan kartla çağrılır — çağıran kart detayına yönlendirir.
     */
    convertToCard: (
      noteId: string,
      listId: string,
      onConverted: (card: ConvertedCard) => void,
    ) => {
      convertMutation.mutate(
        { noteId, listId, clientMutationId: newClientMutationId() },
        { onSuccess: (card) => onConverted({ id: card.id, title: card.title }) },
      );
    },
    /** Dönüşüm uçuşta — picker onayı çift gönderimi engellenir. */
    convertPending: convertMutation.isPending,
  };
}

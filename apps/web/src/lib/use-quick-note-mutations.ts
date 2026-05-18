/**
 * DEM-205 — web "Hızlı Notlar" paneli optimistic CRUD mutation'ları
 * (oluştur / düzenle / sil). DEM-203'teki mobil `useQuickNoteMutations`
 * hook'unun web karşılığı: aynı optimistic akış, `Alert` yerine `toast`.
 *
 * Hepsi TanStack Query optimistic akışında çalışır: `onMutate` `quickNote.list`
 * cache'ini iyimser günceller + snapshot tutar, `onError` snapshot'a geri sarar
 * + `toast.error` gösterir, `onSettled` `quickNote.list`'i invalidate eder
 * (server `createdAt`/`updatedAt` ile reconcile). Yeni not için geçici `tmp-`
 * id'si `onSuccess`'te gerçek satırla değişir.
 *
 * Hızlı Not kişiseldir — rol / `canEdit` gate'i yok; sahibi her zaman düzenler.
 * Oluşturma/düzenleme/silme işbirlikçi değildir (activity/realtime/outbox
 * yazılmaz) — `clientMutationId` taşımaz. Not → kart dönüşümü ayrı bir
 * işbirlikçi mutation'dır: `useQuickNoteConvert`.
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@pusula/ui';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/client';

/** `quickNote.list`'in döndürdüğü tek not satırı. */
export type QuickNote = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/** İyimser olarak eklenmiş, henüz sunucuya yazılmamış notların id öneki. */
const TEMP_ID_PREFIX = 'tmp-';

/** Geçici (`tmp-`) id'li notlar henüz sunucuda yok — aksiyonları kapatılır. */
export function isPendingQuickNoteId(id: string): boolean {
  return id.startsWith(TEMP_ID_PREFIX);
}

export function useQuickNoteMutations() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const listKey = trpc.quickNote.list.queryKey();
  const listFilter = trpc.quickNote.list.queryFilter();

  const fail = () => toast.error(strings.board.quickNotes.actionError);
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
        const tempId = `${TEMP_ID_PREFIX}${crypto.randomUUID()}`;
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
        fail();
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
        fail();
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
        fail();
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
  };
}

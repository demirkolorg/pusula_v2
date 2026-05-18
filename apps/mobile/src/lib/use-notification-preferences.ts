/**
 * Faz 7K — bildirim ayarları mutation'ları: global tercih upsert, scope
 * override upsert/delete.
 *
 * Optimistic akış (web `notifications-channels-form.tsx` /
 * `notifications-scope-tree.tsx` desenleri): `onMutate` ilgili cache'i iyimser
 * günceller + snapshot tutar; `onError` snapshot'a geri sarar + `Alert`;
 * `onSettled` `preferences.get` ve `preferences.list` cache'lerini invalidate
 * eder. Her mutation `clientMutationId` taşır.
 */
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';

type PreferenceGet = RouterOutputs['notifications']['preferences']['get'];
type PreferenceList = RouterOutputs['notifications']['preferences']['list'];

/** Global tercihte gönderilen alanlar — `upsert` girişinin scope'suz alt kümesi. */
export type GlobalPreferenceFields = {
  muteLevel: 'none' | 'mentions_only' | 'all';
  mentionOnly: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietFrom: string | null;
  quietTo: string | null;
  quietTimezone: string | null;
};

/** Scope kimliği — workspace/board/card override'ı seçer. */
export type PreferenceScope = {
  workspaceId?: string;
  boardId?: string;
  cardId?: string;
};

/** Bir tercih satırının scope'unun verilen scope ile eşleşip eşleşmediği. */
function matchesScope(
  row: { workspaceId: string | null; boardId: string | null; cardId: string | null },
  scope: PreferenceScope,
): boolean {
  return (
    (row.workspaceId ?? null) === (scope.workspaceId ?? null) &&
    (row.boardId ?? null) === (scope.boardId ?? null) &&
    (row.cardId ?? null) === (scope.cardId ?? null)
  );
}

/**
 * Bildirim ayar ekranı mutation hook'u. Global tercih (`get` cache) ve scope
 * override listesi (`list` cache) iyimser güncellenir.
 */
export function useNotificationPreferences() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const getKey = trpc.notifications.preferences.get.queryKey({});
  const getFilter = trpc.notifications.preferences.get.queryFilter({});
  const listKey = trpc.notifications.preferences.list.queryKey();
  const listFilter = trpc.notifications.preferences.list.queryFilter();

  const fail = () =>
    Alert.alert(strings.common.errorTitle, strings.notificationSettings.actionError);
  const invalidate = () => {
    void queryClient.invalidateQueries(getFilter);
    void queryClient.invalidateQueries(listFilter);
  };

  // --- Global tercih upsert -------------------------------------------------
  const globalUpsert = useMutation(
    trpc.notifications.preferences.upsert.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(getFilter);
        const previous = queryClient.getQueryData<PreferenceGet>(getKey);
        queryClient.setQueryData<PreferenceGet>(getKey, {
          muteLevel: input.muteLevel,
          mentionOnly: input.mentionOnly,
          pushEnabled: input.pushEnabled,
          emailEnabled: input.emailEnabled,
          quietFrom: input.quietFrom ?? null,
          quietTo: input.quietTo ?? null,
          quietTimezone: input.quietTimezone ?? null,
          // `muteUntil`/`emailMode` bu ekranda yönetilmez; tip uyumu için
          // mevcut değer (yoksa default) taşınır.
          muteUntil: previous?.muteUntil ?? null,
          emailMode: previous?.emailMode ?? 'instant',
        });
        return { previous };
      },
      onError: (_error, _input, ctx) => {
        if (ctx) queryClient.setQueryData(getKey, ctx.previous);
        fail();
      },
      onSettled: invalidate,
    }),
  );

  // --- Scope override upsert ------------------------------------------------
  const scopeUpsert = useMutation(
    trpc.notifications.preferences.upsert.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(listFilter);
        const previous = queryClient.getQueryData<PreferenceList>(listKey);
        if (previous) {
          queryClient.setQueryData<PreferenceList>(
            listKey,
            previous.map((row) =>
              matchesScope(row, input)
                ? {
                    ...row,
                    muteLevel: input.muteLevel,
                    mentionOnly: input.mentionOnly,
                    pushEnabled: input.pushEnabled,
                    emailEnabled: input.emailEnabled,
                    updatedAt: new Date(),
                  }
                : row,
            ),
          );
        }
        return { previous };
      },
      onError: (_error, _input, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
        fail();
      },
      onSettled: invalidate,
    }),
  );

  // --- Scope override delete ------------------------------------------------
  const scopeDelete = useMutation(
    trpc.notifications.preferences.delete.mutationOptions({
      onMutate: async (input) => {
        await queryClient.cancelQueries(listFilter);
        const previous = queryClient.getQueryData<PreferenceList>(listKey);
        if (previous) {
          queryClient.setQueryData<PreferenceList>(
            listKey,
            previous.filter((row) => !matchesScope(row, input)),
          );
        }
        return { previous };
      },
      onError: (_error, _input, ctx) => {
        if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
        fail();
      },
      onSettled: invalidate,
    }),
  );

  return {
    /** Global (scope'suz) tercih satırını günceller. */
    saveGlobal: (fields: GlobalPreferenceFields) => {
      globalUpsert.mutate({ ...fields, clientMutationId: newClientMutationId() });
    },
    /** Bir scope override satırının sustur/kanal alanlarını günceller. */
    saveScope: (
      scope: PreferenceScope,
      fields: { muteLevel: GlobalPreferenceFields['muteLevel']; mentionOnly: boolean; pushEnabled: boolean; emailEnabled: boolean },
    ) => {
      scopeUpsert.mutate({ ...scope, ...fields, clientMutationId: newClientMutationId() });
    },
    /** Bir scope override satırını siler. */
    removeScope: (scope: PreferenceScope) => {
      scopeDelete.mutate({ ...scope, clientMutationId: newClientMutationId() });
    },
    isSavingGlobal: globalUpsert.isPending,
    isSavingScope: scopeUpsert.isPending,
    isRemovingScope: scopeDelete.isPending,
  };
}

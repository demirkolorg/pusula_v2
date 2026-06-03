import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View, useColorScheme } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { SectionAddTrigger } from '@/components/card-detail/section';
import { ChecklistItemRow } from '@/components/card-detail/checklist-item-row';
import {
  ChecklistItemThreadSheet,
} from '@/components/card-detail/checklist-item-thread-sheet';
import type { AuthorResolver } from '@/components/card-detail/comment-list';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { strings } from '@/lib/strings';
import { themeFor } from '@/theme/tokens';

type Checklists = RouterOutputs['checklist']['list'];
type ChecklistItem = Checklists[number]['items'][number];

/** Optimistic eklenen (henüz sunucuda olmayan) madde id ön eki. */
const OPTIMISTIC_PREFIX = 'optimistic-';

/**
 * Madde yorum thread'i (yapılacaklar maddesine yorum) için ekrandan akan bağlam.
 * Verilirse her madde satırı bir yorum rozeti gösterir ve dokununca thread
 * bottom sheet'i açılır. Yorum yazarı çözümleyici + yetki bilgisi kart yorum
 * bölümüyle aynı kaynaktan gelir (tek `resolveAuthor`).
 */
export type ChecklistCommentContext = {
  resolveAuthor: AuthorResolver;
  currentUserId: string | undefined;
  myBoardRole: 'admin' | 'member' | 'viewer' | undefined;
  /** Yorum yazma yetkisi (board `member+` + board aktif) — viewer salt-okur. */
  canComment: boolean;
};

type ChecklistSectionProps = {
  cardId: string;
  checklists: Checklists;
  /** Çağıran board `member+` mi — `false` ise salt-okunur. */
  canEdit: boolean;
  /** Madde yorum bağlamı — verilirse satırlar yorum rozeti + thread sheet'i alır. */
  comments?: ChecklistCommentContext;
  /**
   * Deep-link / bildirimle gelinen madde id'si — yorum bağlamı varsa ve madde
   * yüklenen listede mevcutsa o maddenin thread'i bir kez otomatik açılır.
   */
  initialCommentItemId?: string;
};

/**
 * Kart kontrol listeleri — checklist oluştur/sil + madde işaretle/ekle/sil
 * (Faz 7G + DEM-198). Tüm mutation'lar (`checklist.create` / `.delete`,
 * `checklist.item.toggle` / `.create` / `.delete`) optimistic: `checklist.list`
 * cache'i anında yamanır, hata olursa snapshot'tan geri alınır. `canEdit`
 * `false` ise salt-okunur. Listesi olmayan kart, düzenleyebilen kullanıcıya
 * doğrudan "kontrol listesi ekle" girişini gösterir.
 */
export function ChecklistSection({
  cardId,
  checklists,
  canEdit,
  comments,
  initialCommentItemId,
}: ChecklistSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = themeFor(useColorScheme());
  const checklistKey = trpc.checklist.list.queryKey({ cardId });
  // Açık madde yorum thread'i — bir madde id'si tutar; tek sheet tüm satırlar
  // için paylaşılır (her satıra ayrı modal mount edilmez). `null` → kapalı.
  const [openThreadItemId, setOpenThreadItemId] = useState<string | null>(null);
  // Deep-link auto-open yalnız bir kez — kullanıcı sheet'i kapatınca tekrar
  // açılmamalı (madde checklist'te göründüğü ilk render'da tetiklenir).
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (!comments || !initialCommentItemId) return;
    // Madde gerçekten yüklenen listede var mı? Yoksa (yanlış/eski id) sheet'i
    // açma — boş thread göstermek yerine sessizce yok say.
    const exists = checklists.some((list) =>
      list.items.some((item) => item.id === initialCommentItemId),
    );
    if (!exists) return;
    autoOpenedRef.current = true;
    setOpenThreadItemId(initialCommentItemId);
  }, [comments, initialCommentItemId, checklists]);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: checklistKey });
    void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
  };

  /** `checklist.list` cache'ini güvenli yamalar (snapshot döner). */
  const patch = async (
    update: (lists: Checklists) => Checklists,
  ): Promise<{ prev: Checklists | undefined }> => {
    await queryClient.cancelQueries({ queryKey: checklistKey });
    const prev = queryClient.getQueryData<Checklists>(checklistKey);
    if (prev) queryClient.setQueryData<Checklists>(checklistKey, update(prev));
    return { prev };
  };

  const rollback = (ctx: { prev: Checklists | undefined } | undefined) => {
    if (ctx?.prev) queryClient.setQueryData(checklistKey, ctx.prev);
    Alert.alert(strings.cardDetail.checklistsTitle, strings.cardDetail.actionError);
  };

  const toggleItem = useMutation(
    trpc.checklist.item.toggle.mutationOptions({
      onMutate: (vars) =>
        patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? {
                  ...list,
                  items: list.items.map((item) =>
                    item.id === vars.itemId ? { ...item, completed: vars.completed } : item,
                  ),
                }
              : list,
          ),
        ),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const createItem = useMutation(
    trpc.checklist.item.create.mutationOptions({
      onMutate: (vars) => {
        const now = new Date();
        const optimistic: ChecklistItem = {
          id: `${OPTIMISTIC_PREFIX}${vars.clientMutationId ?? newClientMutationId()}`,
          checklistId: vars.checklistId,
          content: vars.content,
          // Sona eklenir — gerçek pozisyon `onSettled` invalidate ile gelir.
          position: 'zzzzzz',
          completed: false,
          completedAt: null,
          completedBy: null,
          // Yeni madde henüz yorum almadı — optimistic satır 0 ile başlar,
          // gerçek sayı `onSettled` invalidate ile gelir.
          commentCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        return patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? { ...list, items: [...list.items, optimistic] }
              : list,
          ),
        );
      },
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const updateItem = useMutation(
    trpc.checklist.item.update.mutationOptions({
      onMutate: (vars) =>
        patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? {
                  ...list,
                  items: list.items.map((item) =>
                    item.id === vars.itemId ? { ...item, content: vars.content } : item,
                  ),
                }
              : list,
          ),
        ),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const deleteItem = useMutation(
    trpc.checklist.item.delete.mutationOptions({
      onMutate: (vars) =>
        patch((lists) =>
          lists.map((list) =>
            list.id === vars.checklistId
              ? { ...list, items: list.items.filter((item) => item.id !== vars.itemId) }
              : list,
          ),
        ),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const createChecklist = useMutation(
    trpc.checklist.create.mutationOptions({
      onMutate: (vars) => {
        const now = new Date();
        const optimistic: Checklists[number] = {
          id: `${OPTIMISTIC_PREFIX}${vars.clientMutationId ?? newClientMutationId()}`,
          cardId: vars.cardId,
          title: vars.title,
          // Sona eklenir — gerçek pozisyon `onSettled` invalidate ile gelir.
          position: 'zzzzzz',
          createdAt: now,
          updatedAt: now,
          items: [],
        };
        return patch((lists) => [...lists, optimistic]);
      },
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  const deleteChecklist = useMutation(
    trpc.checklist.delete.mutationOptions({
      onMutate: (vars) => patch((lists) => lists.filter((list) => list.id !== vars.checklistId)),
      onError: (_error, _vars, ctx) => rollback(ctx),
      onSettled: invalidate,
    }),
  );

  /** Onaylı kontrol listesi silme — liste + tüm maddeleri kalıcı kaldırır. */
  const confirmDeleteChecklist = (checklist: Checklists[number]) => {
    Alert.alert(
      strings.cardDetail.checklistDeleteConfirmTitle,
      strings.cardDetail.checklistDeleteConfirmBody,
      [
        { text: strings.common.cancel, style: 'cancel' },
        {
          text: strings.cardDetail.checklistDeleteAction,
          style: 'destructive',
          onPress: () =>
            deleteChecklist.mutate({
              cardId,
              checklistId: checklist.id,
              clientMutationId: newClientMutationId(),
            }),
        },
      ],
    );
  };

  return (
    <>
    <View className="gap-4">
      {checklists.length === 0 && !canEdit ? (
        <Text className="text-sm text-muted-foreground">
          {strings.cardDetail.checklistsEmpty}
        </Text>
      ) : null}

      {checklists.map((checklist) => {
        const optimisticList = checklist.id.startsWith(OPTIMISTIC_PREFIX);
        const doneCount = checklist.items.filter((item) => item.completed).length;
        return (
          <View key={checklist.id} className="gap-2">
            <View className="min-h-11 flex-row items-center justify-between gap-2">
              <Text
                weight="medium"
                className="flex-1 text-sm text-foreground"
                numberOfLines={1}
              >
                {checklist.title}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {doneCount}/{checklist.items.length}
              </Text>
              {canEdit && !optimisticList ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={strings.cardDetail.checklistDelete}
                  disabled={deleteChecklist.isPending}
                  onPress={() => confirmDeleteChecklist(checklist)}
                  hitSlop={10}
                  className="active:opacity-60"
                >
                  <Icon name="trash-2" size={16} color={theme.mutedForeground} />
                </Pressable>
              ) : null}
            </View>

            {checklist.items.length > 0 ? (
              <View>
                {checklist.items.map((item) => (
                  <ChecklistItemRow
                    key={item.id}
                    item={item}
                    optimistic={item.id.startsWith(OPTIMISTIC_PREFIX)}
                    canEdit={canEdit}
                    onToggle={(completed) =>
                      toggleItem.mutate({
                        cardId,
                        checklistId: checklist.id,
                        itemId: item.id,
                        completed,
                        clientMutationId: newClientMutationId(),
                      })
                    }
                    onRename={(content) =>
                      updateItem.mutate({
                        cardId,
                        checklistId: checklist.id,
                        itemId: item.id,
                        content,
                        clientMutationId: newClientMutationId(),
                      })
                    }
                    onDelete={() =>
                      deleteItem.mutate({
                        cardId,
                        checklistId: checklist.id,
                        itemId: item.id,
                        clientMutationId: newClientMutationId(),
                      })
                    }
                    // Yorum bağlamı varsa satır rozeti + thread sheet açma.
                    onOpenComments={
                      comments ? () => setOpenThreadItemId(item.id) : undefined
                    }
                  />
                ))}
              </View>
            ) : null}

            {canEdit && !optimisticList ? (
              <ChecklistItemComposer
                pending={createItem.isPending}
                onCreate={(content) =>
                  createItem.mutate({
                    cardId,
                    checklistId: checklist.id,
                    content,
                    clientMutationId: newClientMutationId(),
                  })
                }
              />
            ) : null}
          </View>
        );
      })}

      {canEdit ? (
        <ChecklistComposer
          pending={createChecklist.isPending}
          onCreate={(title) =>
            createChecklist.mutate({
              cardId,
              title,
              clientMutationId: newClientMutationId(),
            })
          }
        />
      ) : null}
    </View>

    {/* Madde yorum thread'i — tek paylaşılan bottom sheet (açık madde id'sine
        göre). Yorum bağlamı yoksa hiç render edilmez. */}
    {comments ? (
      <ChecklistItemThreadSheet
        visible={openThreadItemId != null}
        cardId={cardId}
        checklistItemId={openThreadItemId}
        resolveAuthor={comments.resolveAuthor}
        currentUserId={comments.currentUserId}
        myBoardRole={comments.myBoardRole}
        canComment={comments.canComment}
        onClose={() => setOpenThreadItemId(null)}
      />
    ) : null}
    </>
  );
}

/**
 * Kart altındaki "kontrol listesi ekle" girişi (DEM-198 + DEM-204). Varsayılan
 * kapalı — kompakt "+ ekle" tetikleyicisi; dokununca satır-içi giriş açılır.
 * Gönderdikten sonra alan temizlenir ama composer açık kalır (art arda liste
 * eklemeye izin — Trello deseni); "Vazgeç" composer'ı kapatır.
 */
function ChecklistComposer({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (title: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const submit = () => {
    const trimmed = title.trim();
    // `checklist.create` idempotent değil — uçuştaki istek varken ya da boş
    // başlıkla yeni liste gönderme (çift liste oluşmasın).
    if (trimmed.length === 0 || pending) return;
    onCreate(trimmed);
    // Optimistic ekleme anında görünür; alanı hemen temizle.
    setTitle('');
  };

  const close = () => {
    setTitle('');
    setOpen(false);
  };

  if (!open) {
    return (
      <SectionAddTrigger label={strings.cardDetail.checklistAdd} onPress={() => setOpen(true)} />
    );
  }

  return (
    <View className="gap-2">
      <TextField
        label={strings.cardDetail.checklistAdd}
        placeholder={strings.cardDetail.checklistTitlePlaceholder}
        value={title}
        onChangeText={setTitle}
        editable={!pending}
        returnKeyType="done"
        onSubmitEditing={submit}
        autoFocus
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label={strings.cardDetail.cancel}
            variant="ghost"
            onPress={close}
            disabled={pending}
          />
        </View>
        <View className="flex-1">
          <Button
            label={strings.cardDetail.checklistAdd}
            onPress={submit}
            pending={pending}
            disabled={title.trim().length === 0 || pending}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Tek kontrol listesinin altındaki "madde ekle" girişi (DEM-204). Varsayılan
 * kapalı — "+ Madde ekle" tetikleyicisi; açılınca satır-içi giriş. Gönderim
 * sonrası alan temizlenir, composer açık kalır (art arda madde girişi).
 */
function ChecklistItemComposer({
  pending,
  onCreate,
}: {
  pending: boolean;
  onCreate: (content: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');

  const submit = () => {
    const trimmed = content.trim();
    // `checklist.item.create` idempotent değil — uçuştaki istek varken ya da
    // boş içerikle yeni madde gönderme (çift madde oluşmasın).
    if (trimmed.length === 0 || pending) return;
    onCreate(trimmed);
    // Optimistic ekleme anında görünür; alanı hemen temizleyip arka arkaya
    // madde girişine izin ver.
    setContent('');
  };

  const close = () => {
    setContent('');
    setOpen(false);
  };

  if (!open) {
    return (
      <View className="mt-0.5">
        <SectionAddTrigger
          label={strings.cardDetail.checklistItemAdd}
          onPress={() => setOpen(true)}
        />
      </View>
    );
  }

  return (
    <View className="mt-1 gap-2">
      <TextField
        label={strings.cardDetail.checklistItemAdd}
        placeholder={strings.cardDetail.checklistItemPlaceholder}
        value={content}
        onChangeText={setContent}
        editable={!pending}
        returnKeyType="done"
        onSubmitEditing={submit}
        autoFocus
      />
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            label={strings.cardDetail.cancel}
            variant="ghost"
            onPress={close}
            disabled={pending}
          />
        </View>
        <View className="flex-1">
          <Button
            label={strings.cardDetail.checklistItemAdd}
            onPress={submit}
            pending={pending}
            disabled={content.trim().length === 0 || pending}
          />
        </View>
      </View>
    </View>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import type Animated from 'react-native-reanimated';
import type { AnimatedRef } from 'react-native-reanimated';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { RouterOutputs } from '@pusula/api';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { TextField } from '@/components/text-field';
import { SectionHeader, SectionHeaderAction } from '@/components/card-detail/section';
import { ChecklistItemRow } from '@/components/card-detail/checklist-item-row';
import { ChecklistItemEditSheet } from '@/components/card-detail/checklist-item-edit-sheet';
import { SortableChecklistItems } from '@/components/card-detail/sortable-checklist-items';
import {
  ChecklistItemThreadSheet,
} from '@/components/card-detail/checklist-item-thread-sheet';
import type { AuthorResolver } from '@/components/card-detail/comment-list';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { OPTIMISTIC_PREFIX, applyOrder } from '@/lib/checklist-reorder';
import { strings } from '@/lib/strings';
import { useTheme } from '@/theme/theme-provider';

type Checklists = RouterOutputs['checklist']['list'];
type ChecklistItem = Checklists[number]['items'][number];

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
  /**
   * Madde sürükleme (sortable) başlayınca `true`, bitince `false` — üst bileşen
   * (kart detay ekranı) dış `ScrollView`'un dikey scroll'unu kilitler, böylece
   * dikey drag pan'i dış scroll ile çakışmaz.
   */
  onDragActiveChange?: (active: boolean) => void;
  /**
   * Dış scroll'un animated ref'i — `SortableChecklistItems`'a iletilir; madde
   * sürükleme Pan'ı bu ref ile koordine edilir (uzun-bas dikey sürüklemenin
   * native scroll tarafından yutulmaması için).
   */
  scrollRef?: AnimatedRef<Animated.ScrollView>;
  /**
   * Bildirim deep-link'iyle gelinince bu id'li madde flash vurgulanır (bir kez).
   * `initialCommentItemId`'den farklı: thread açmaz, yalnız görsel vurgu yapar.
   */
  highlightItemId?: string;
  /**
   * Tablet yan-yana yerleşiminde kart yüzeyi `flex-1` ile kapsayıcısını dikey
   * doldurur — yandaki "Açıklama" bölümüyle eşit yükseklikte kalsın
   * (`DescriptionChecklistTabs` `items-stretch`). Telefonda (alt-alta) `false`.
   */
  fill?: boolean;
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
  onDragActiveChange,
  scrollRef,
  highlightItemId,
  fill = false,
}: ChecklistSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const checklistKey = trpc.checklist.list.queryKey({ cardId });
  // Açık madde yorum thread'i — bir madde id'si tutar; tek sheet tüm satırlar
  // için paylaşılır (her satıra ayrı modal mount edilmez). `null` → kapalı.
  const [openThreadItemId, setOpenThreadItemId] = useState<string | null>(null);
  // Açık madde düzenleme sheet'i — hedef madde (checklist + id + mevcut içerik).
  // Tek sheet paylaşılır; `update` mutation `checklistId` istediğinden id'yle
  // birlikte taşınır. `null` → kapalı.
  const [editTarget, setEditTarget] = useState<{
    checklistId: string;
    itemId: string;
    content: string;
  } | null>(null);
  // Deep-link auto-open yalnız bir kez — kullanıcı sheet'i kapatınca tekrar
  // açılmamalı (madde checklist'te göründüğü ilk render'da tetiklenir).
  const autoOpenedRef = useRef(false);
  // "Kontrol listesi ekle" composer'ı açık mı — tetikleyici artık bölüm
  // başlığındaki "+ Ekle" aksiyonunda (2026-06-20); form gövdenin sonunda açılır.
  const [addOpen, setAddOpen] = useState(false);
  // Hangi kontrol listesinin "madde ekle" composer'ı açık (id) — tetikleyici o
  // listenin kendi header'ındaki "+" aksiyonunda; aynı anda tek liste açık.
  const [addItemChecklistId, setAddItemChecklistId] = useState<string | null>(null);

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

  // Madde sıralama (DEM — manuel reanimated sortable). `reorder` mutation'ı
  // yalnız transport: optimistic cache patch'i + rollback `handleReorder`'da
  // elle yönetilir (input şeması yalnız komşu id'leri taşır; tam sıra cache'te
  // ayrıca düzenlenmeli). `onSettled` invalidate gerçek LexoRank pozisyonlarını
  // getirir. Drag SIRASINDA değil — yalnız `onDragEnd`'de bir kez çağrılır.
  // NOT: Hızlı ardışık drag'lerde (bir mutation uçuştayken yenisi başlarsa)
  // optimistic patch'ler arasında geçici görsel zıplama mümkün; `onSettled`
  // invalidate her seferinde sunucu sırasını yeniden çekerek nihai tutarlılığı
  // sağlar (gözle görülen kayma anlık, kalıcı değil).
  const reorderItem = useMutation(
    trpc.checklist.item.reorder.mutationOptions({ onSettled: invalidate }),
  );

  /**
   * Sürükleme bittiğinde (sortable `onReorder`) — önce cache'te ilgili
   * checklist'in `items` dizisini yeni sıraya göre yeniden dizip (optimistic,
   * anında), sonra `reorder` mutation'ını gerçek komşularla atar. Hata → elle
   * `rollback(snapshot)`; başarı/hata fark etmez `onSettled` invalidate eder.
   */
  const handleReorder = (
    checklistId: string,
    args: {
      itemId: string;
      beforeItemId: string | undefined;
      afterItemId: string | undefined;
      orderedIds: string[];
    },
  ) => {
    // Optimistic sıra patch'i — snapshot rollback için saklanır.
    void patch((lists) =>
      lists.map((list) =>
        list.id === checklistId
          ? { ...list, items: applyOrder(list.items, args.orderedIds) }
          : list,
      ),
    ).then((ctx) => {
      reorderItem.mutate(
        {
          cardId,
          checklistId,
          itemId: args.itemId,
          beforeItemId: args.beforeItemId,
          afterItemId: args.afterItemId,
          clientMutationId: newClientMutationId(),
        },
        { onError: () => rollback(ctx) },
      );
    });
  };

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
    {/* Kendi kart yüzeyi + başlık (2026-06-20) — Açıklama bölümüyle aynı desen.
        Başlıkta solda "Kontrol listeleri", sağda "+ Ekle" (member+); composer
        gövdenin sonunda açılır. */}
    <View
      className={`gap-3 rounded-xl border border-border bg-card p-3.5 ${fill ? 'flex-1' : ''}`}
    >
      <SectionHeader
        icon="check-square"
        title={strings.cardDetail.checklistsTitle}
        actions={
          canEdit && !addOpen ? (
            <SectionHeaderAction
              icon="plus"
              label={strings.cardDetail.checklistAdd}
              onPress={() => setAddOpen(true)}
            />
          ) : undefined
        }
      />

      <View className="gap-4">
      {checklists.length === 0 && !addOpen ? (
        <Text className="text-sm text-muted-foreground">
          {strings.cardDetail.checklistsEmpty}
        </Text>
      ) : null}

      {checklists.map((checklist) => {
        const optimisticList = checklist.id.startsWith(OPTIMISTIC_PREFIX);
        const doneCount = checklist.items.filter((item) => item.completed).length;
        return (
          // Her kontrol listesi kendi bordürlü kartında + header'ında (2026-06-20)
          // — bölüm/Açıklama deseninin alt seviyesi. Header: solda başlık + ilerleme,
          // sağda "madde ekle" (+) ve sil. Madde composer'ı header "+"sıyla açılır.
          <View key={checklist.id} className="gap-2 rounded-lg border border-border p-3">
            <View className="min-h-9 flex-row items-center gap-2">
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
                // Sabit 40×40 dokunma kutuları + aralarında boşluk (gap-1.5) —
                // `hitSlop` çakışıp yanlış butona basılmasını önler (kutu sınırı
                // net). "+" madde ekler, çöp sepeti listeyi siler.
                <View className="flex-row items-center gap-1.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.cardDetail.checklistItemAdd}
                    onPress={() => setAddItemChecklistId(checklist.id)}
                    className="h-10 w-10 items-center justify-center rounded-md active:bg-muted"
                  >
                    <Icon name="plus" size={18} color={theme.primary} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={strings.cardDetail.checklistDelete}
                    disabled={deleteChecklist.isPending}
                    onPress={() => confirmDeleteChecklist(checklist)}
                    className="h-10 w-10 items-center justify-center rounded-md active:bg-muted"
                  >
                    <Icon name="trash-2" size={16} color={theme.mutedForeground} />
                  </Pressable>
                </View>
              ) : null}
            </View>

            {checklist.items.length > 0 ? (
              <SortableChecklistItems
                items={checklist.items}
                // Sürükleme yalnız düzenleyebilen + optimistic olmayan liste için
                // (sortable içinde optimistic madde varken de kendiliğinden
                // kapanır — `hasOptimistic`). Optimistic liste hiç sürüklenemez.
                canDrag={canEdit && !optimisticList}
                onReorder={(args) => handleReorder(checklist.id, args)}
                onDragActiveChange={onDragActiveChange}
                scrollRef={scrollRef}
                renderItem={(item) => (
                  <ChecklistItemRow
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
                    onEdit={() =>
                      setEditTarget({
                        checklistId: checklist.id,
                        itemId: item.id,
                        content: item.content,
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
                    highlighted={item.id === highlightItemId}
                  />
                )}
              />
            ) : null}

            {canEdit && !optimisticList ? (
              <ChecklistItemComposer
                open={addItemChecklistId === checklist.id}
                onClose={() => setAddItemChecklistId(null)}
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
          open={addOpen}
          onClose={() => setAddOpen(false)}
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
    </View>

    {/* Madde yorum thread'i — KOŞULLU mount: yalnız bir madde thread'i açıkken
        Modal mount edilir. Önceden her kart açılışında (visible=false) sürekli
        mount ediliyordu; kart detayındaki diğer sheet'lerle (CardActionsSheet,
        CardMetaBar) üst üste binen her-zaman-mount Modal iOS'ta native crash'e
        yol açıyordu. Diğer sheet'ler gibi koşullu mount → çakışma yok. */}
    {comments && openThreadItemId != null ? (
      <ChecklistItemThreadSheet
        visible
        cardId={cardId}
        checklistItemId={openThreadItemId}
        resolveAuthor={comments.resolveAuthor}
        currentUserId={comments.currentUserId}
        myBoardRole={comments.myBoardRole}
        canComment={comments.canComment}
        onClose={() => setOpenThreadItemId(null)}
      />
    ) : null}

    {/* Madde düzenleme sheet'i — thread sheet gibi KOŞULLU mount (çakışan
        her-zaman-mount Modal'ların iOS crash'ini önler). `key={itemId}` ile her
        madde için taze taslak. `update` optimistic olduğundan kaydetme anında
        sheet kapanır, değişiklik anında görünür. */}
    {editTarget != null ? (
      <ChecklistItemEditSheet
        key={editTarget.itemId}
        visible
        initialContent={editTarget.content}
        pending={updateItem.isPending}
        onSave={(content) =>
          updateItem.mutate({
            cardId,
            checklistId: editTarget.checklistId,
            itemId: editTarget.itemId,
            content,
            clientMutationId: newClientMutationId(),
          })
        }
        onClose={() => setEditTarget(null)}
      />
    ) : null}
    </>
  );
}

/**
 * "Kontrol listesi ekle" satır-içi composer'ı (DEM-198 + DEM-204; 2026-06-20
 * controlled). Tetikleyici artık bölüm başlığındaki "+ Ekle" aksiyonunda —
 * bu bileşen yalnız FORM'u render eder, açık/kapalı durumu üstten (`open`)
 * gelir. Gönderdikten sonra alan temizlenir ama form açık kalır (art arda liste
 * eklemeye izin — Trello deseni); "Vazgeç" `onClose` ile kapatır.
 */
function ChecklistComposer({
  open,
  onClose,
  pending,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onCreate: (title: string) => void;
}) {
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
    onClose();
  };

  if (!open) return null;

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
 * Tek kontrol listesinin "madde ekle" girişi (DEM-204; 2026-06-20 controlled).
 * Tetikleyici artık o listenin kendi header'ındaki "+" aksiyonunda — bu bileşen
 * yalnız FORM'u render eder, açık/kapalı durumu üstten (`open`) gelir. Gönderim
 * sonrası alan temizlenir, form açık kalır (art arda madde girişi); "Vazgeç"
 * `onClose` ile kapatır.
 */
function ChecklistItemComposer({
  open,
  onClose,
  pending,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  pending: boolean;
  onCreate: (content: string) => void;
}) {
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
    onClose();
  };

  if (!open) return null;

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

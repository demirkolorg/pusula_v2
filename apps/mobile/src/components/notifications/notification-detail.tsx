import { useEffect, useRef, type ReactNode } from 'react';
import { Pressable, ScrollView, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/provider';
import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { EntityAvatar } from '@/components/entity-avatar';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { formatRelativeTime, formatTimestamp } from '@/lib/format-date';
import {
  buildNotificationChanges,
  notificationCategoryLabel,
  type NotificationChange,
} from '@/lib/notification-audit';
import {
  isSystemNotification,
  notificationSummary,
  notificationTypeIcon,
  notificationTypeTone,
} from '@/lib/notification-display';
import { notificationCardTarget } from '@/lib/notification-target';
import { strings } from '@/lib/strings';
import { useFloatingNavInset } from '@/lib/use-floating-nav-inset';
import { useNotificationMutations } from '@/lib/use-notification-mutations';
import { themeFor } from '@/theme/tokens';

/** Bildirim merkezi listesiyle aynı sayfa girişi — markRead cache senkronu için. */
const LIST_INPUT = { limit: 25 } as const;

type NotificationDetailProps = {
  /** Açılacak bildirimin kimliği. `null` ise boş (tablet pane ilk açılış) durum. */
  notificationId: string | null;
};

/** Bir bölüm kartı — başlık + içerik (token-temelli, kenarlıksız yumuşak kart). */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text weight="semibold" className="px-0.5 text-xs uppercase text-muted-foreground">
        {title}
      </Text>
      <View className="gap-3 rounded-2xl bg-muted p-4">{children}</View>
    </View>
  );
}

/** Tek "önce → sonra" veya "değer" satırı. */
function ChangeRow({ change }: { change: NotificationChange }) {
  const detail = strings.notifications.detail;
  if (change.kind === 'value') {
    return (
      <View className="gap-1">
        <Text weight="medium" className="text-xs text-muted-foreground">
          {change.label}
          {change.truncated ? ` ${detail.truncated}` : ''}
        </Text>
        <Text className="text-sm text-foreground">{change.value || detail.emptyValue}</Text>
      </View>
    );
  }
  return (
    <View className="gap-1.5">
      <Text weight="medium" className="text-xs text-muted-foreground">
        {change.label}
        {change.truncated ? ` ${detail.truncated}` : ''}
      </Text>
      <View className="gap-1">
        <View className="flex-row items-start gap-2">
          <Text className="w-12 text-[11px] uppercase text-muted-foreground">
            {detail.changeFrom}
          </Text>
          <Text className="flex-1 text-sm text-foreground line-through opacity-70">
            {change.from || detail.emptyValue}
          </Text>
        </View>
        <View className="flex-row items-start gap-2">
          <Text className="w-12 text-[11px] uppercase text-muted-foreground">
            {detail.changeTo}
          </Text>
          <Text className="flex-1 text-sm text-foreground">{change.to || detail.emptyValue}</Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Bildirim detay / audit içeriği (Faz 5+6, 2026-06-21). Hem tam-ekran route
 * (`app/(app)/(notifications)/[id].tsx`) hem tablet master-detail sağ pane'i
 * bunu paylaşır.
 *
 * İçerik: aktör (sistem bildiriminde tip rozeti) + göreli/tam zaman, "ne oldu"
 * özeti + tip kategorisi, before/after değişiklikler (`buildNotificationChanges`),
 * katlanır ham JSON, ve "Karta git" butonu (`notificationCardTarget` → kart +
 * mevcut scroll/flash). Açılınca okunmamışsa `markRead`.
 *
 * Sözleşme: `docs/architecture/06-bildirim-altyapisi.md` +
 * `docs/domain/04-bildirim-kurallari.md` "Bildirim detay ekranı".
 */
export function NotificationDetail({ notificationId }: NotificationDetailProps) {
  const trpc = useTRPC();
  const router = useRouter();
  const theme = themeFor(useColorScheme());
  const detail = strings.notifications.detail;
  const navInset = useFloatingNavInset();
  const { markRead } = useNotificationMutations(LIST_INPUT);

  const hasId = notificationId != null && notificationId.length > 0;
  const query = useQuery(
    trpc.notifications.byId.queryOptions({ id: notificationId ?? '' }, { enabled: hasId }),
  );
  const notification = query.data ?? null;

  // Açılınca okunmamışsa okundu işaretle — bildirim id'si başına YALNIZ BİR KEZ
  // (`markedRef`). `markRead` optimistic'i `byId` cache'ini güncellemediğinden
  // `notification.readAt` null kalabilir; salt `readAt` guard'ı tablet master-
  // detail'de (liste unreadCount değişimiyle sürekli re-render) sonsuz markRead
  // döngüsüne girip okunmamış sayacını "eritiyordu". id-başına ref guard döngüyü
  // kırar (web `notifications/[id]/page.tsx` `firedForRef` ile simetrik).
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      notification &&
      notification.readAt == null &&
      markedRef.current !== notification.id
    ) {
      markedRef.current = notification.id;
      markRead(notification.id);
    }
  }, [notification, markRead]);

  // Tablet pane ilk açılış (henüz seçim yok) → boş durum.
  if (!hasId) {
    return <EmptyState icon="bell" title={detail.emptyTitle} description={detail.emptyBody} />;
  }

  if (query.isPending) {
    return <EmptyState icon="bell" title={strings.common.loading} description={detail.title} />;
  }

  if (query.isError || !notification) {
    return (
      <EmptyState
        icon="alert-triangle"
        title={detail.loadErrorTitle}
        description={detail.loadErrorBody}
      >
        <View className="w-40">
          <Button label={strings.common.retry} variant="ghost" onPress={() => query.refetch()} />
        </View>
      </EmptyState>
    );
  }

  const system = isSystemNotification(notification.type);
  const tone = notificationTypeTone(notification.type, theme);
  const iconName = notificationTypeIcon(notification.type);
  const summary = notificationSummary(notification.type, notification.payload);
  const actorName = notification.actorName ?? strings.notifications.fallbackActorName;
  const relativeTime = formatRelativeTime(notification.createdAt);
  const fullTime = formatTimestamp(notification.createdAt);

  // "Karta git" hedefi — kart/board/workspace daralması. `byId` üst-seviye
  // id'leri + payload taşır; hedef yoksa (hesap-seviyesi) buton gizlenir.
  const cardTarget = notificationCardTarget({
    workspaceId: notification.workspaceId,
    boardId: notification.boardId,
    cardId: notification.cardId,
    payload: notification.payload,
  });
  const goToLabel =
    cardTarget?.pathname === '/cards/[cardId]'
      ? detail.goToCard
      : cardTarget?.pathname === '/boards/[boardId]'
        ? detail.goToBoard
        : detail.goToWorkspace;

  // Before/after — activity event payload yeğlenir (tam diff); yoksa bildirim
  // payload'ı denenir (eski bildirimlerde activity bağı olmayabilir). Yalnız
  // gerçek "önce → sonra" değişiklikleri gösterilir; tek-skaler teknik bağlam
  // alanları (activityType, cardId, actorName … kullanıcıya anlamsız anahtarlar)
  // gizlenir.
  const changes = buildNotificationChanges(
    notification.activityEventPayload ?? notification.payload,
  ).filter((change) => change.kind === 'diff');

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-5 p-4"
      contentContainerStyle={{ paddingBottom: navInset || 16 }}
    >
      {/* Aktör / sistem başlığı + zaman. */}
      <View className="flex-row items-center gap-3">
        {system ? (
          <View
            className="h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: `${tone}22` }}
          >
            <Icon name={iconName} size={22} color={tone} />
          </View>
        ) : (
          <EntityAvatar name={actorName} image={notification.actorImage} size={48} />
        )}
        <View className="flex-1 gap-0.5">
          <Text weight="semibold" numberOfLines={1} className="text-base text-foreground">
            {system ? detail.systemActor : actorName}
          </Text>
          <Text className="text-xs text-muted-foreground">{relativeTime}</Text>
        </View>
      </View>

      {/* Ne oldu — özet + tip kategorisi. Özet bölümün başrolü olduğundan
          (kullanıcı bu ekrana "ne oldu?" sorusuyla gelir) metni daha büyük +
          medium ağırlıkla öne çıkarırız (text-base / leading-relaxed). */}
      <Section title={detail.whatHappened}>
        <Text weight="medium" className="text-base leading-relaxed text-foreground">
          {summary}
        </Text>
        <View className="flex-row items-center gap-2">
          <View
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: `${tone}22` }}
          >
            <Icon name={iconName} size={14} color={tone} />
          </View>
          <Text className="text-xs text-muted-foreground">
            {notificationCategoryLabel(notification.type)}
          </Text>
        </View>
      </Section>

      {/* Değişiklikler — before/after diff. Gösterilecek "önce → sonra" yoksa
          bölüm hiç render edilmez (boş "değişiklik yok" metni göstermek yerine
          gürültüyü azalt). Çoğu bildirim tipi diff taşımaz; bu satırlarda bölüm
          tamamen gizli kalır. */}
      {changes.length > 0 ? (
        <Section title={detail.changesTitle}>
          <View className="gap-3">
            {changes.map((change, index) => (
              <ChangeRow key={`${change.label}-${index}`} change={change} />
            ))}
          </View>
        </Section>
      ) : null}

      {/* Ulaştığı zaman — tam damga. */}
      {fullTime ? (
        <Section title={detail.receivedAt}>
          <Text className="text-sm text-foreground">{fullTime}</Text>
        </Section>
      ) : null}

      {/* Karta git — kart/board/workspace hedefi; hedef yoksa gizli. */}
      {cardTarget ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={goToLabel}
          onPress={() => router.push(cardTarget)}
          className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-primary px-4 active:opacity-80"
        >
          <Text weight="semibold" className="text-base text-primary-foreground">
            {goToLabel}
          </Text>
          <Icon name="arrow-right" size={18} color={theme.primaryForeground} />
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

import { useRouter } from 'expo-router';
import { PageHero } from '@/components/page-hero';
import { featherForEntityName } from '@/lib/entity-icon';
import { strings } from '@/lib/strings';

type WorkspaceHeroHeaderProps = {
  /** Aktif workspace id'si — üyeler listesinin hedefi. */
  workspaceId: string;
  /** Workspace adı (başlık). */
  title: string;
  /** Workspace ikonu (domain `EntityIcon` adı); Feather'a çevrilir, yoksa fallback. */
  icon?: string;
  /** Üye sayısı — "N üye" özeti olarak gösterilir; dokununca üyeler listesi açılır. */
  memberCount?: number;
};

/**
 * Workspace board listesi ekranının ortak hero başlığı (2026-06-21) — hesap alt
 * sayfalarıyla aynı [`PageHero`](./page-hero.tsx) çizgisi: ortalanmış workspace
 * ikonu + adı + tıklanabilir "N üye" özeti. Üye özetine dokunmak workspace üyeler
 * listesini (Faz 7D) açar — ayrı aksiyon butonu yoktur.
 *
 * Workspace ikonu DB'de domain `EntityIcon` adıyla durur; mobil Feather setine
 * [`featherForEntityName`](../lib/entity-icon.ts) ile çevrilir (tanınmayan değer
 * güvenli fallback'e düşer).
 *
 * Hem phone route'u ([`workspaces/[id].tsx`](../../app/(app)/(boards)/workspaces/[id].tsx))
 * hem tablet master-detail sağ pane'i ([`(boards)/index.tsx`](../../app/(app)/(boards)/index.tsx))
 * aynı görseli bu bileşenle paylaşır.
 */
export function WorkspaceHeroHeader({
  workspaceId,
  title,
  icon,
  memberCount,
}: WorkspaceHeroHeaderProps) {
  const router = useRouter();
  const subtitle =
    memberCount != null
      ? `${memberCount} ${strings.workspaces.memberCountSuffix}`
      : undefined;
  return (
    <PageHero
      icon={featherForEntityName(icon)}
      title={title}
      subtitle={subtitle}
      onSubtitlePress={
        subtitle
          ? () =>
              router.push({
                pathname: '/workspace-members/[id]',
                params: { id: workspaceId, name: title },
              })
          : undefined
      }
    />
  );
}

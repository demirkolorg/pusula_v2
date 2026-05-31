import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useIsTablet } from '@/lib/use-device-class';

export type MasterDetailFallback = 'master' | 'detail';

export interface MasterDetailLayoutProps {
  /** Sol (master) tarafa render edilecek içerik — tablet'te sidebar, phone'da varsayılan view. */
  master: ReactNode;
  /** Sağ (detail) tarafa render edilecek içerik — tablet'te main pane, phone'da `selectedDetail` ile gösterilir. */
  detail: ReactNode;
  /**
   * Phone'da `selectedDetail` yokken hangi taraf render edilsin.
   * Default `'master'` — kullanıcı seçim yapana kadar liste/sidebar gözükür.
   */
  fallback?: MasterDetailFallback;
  /** Phone branch için: `true` ise `detail` render edilir; `false` ise `fallback` taraf çizilir. Tablet branch'inde yok sayılır. */
  selectedDetail?: boolean;
  /** Tablet sidebar (master) genişliği — px. Default 320, önerilen aralık 320–400 ([`13-ui-tasarim-dili.md`](../../../../docs/architecture/13-ui-tasarim-dili.md) §13.12.1). */
  sidebarWidth?: number;
  /** Test/E2E erişimi için ekran kökü id'si; `${testID}-master` / `${testID}-detail` alt slot id'leri tablet branch'inde üretilir. */
  testID?: string;
}

/**
 * Faz 15C (DEM-303) — master-detail layout primitive'i.
 *
 * **Tablet** (`useIsTablet() === true`): `flex-row` yan yana — sol sidebar
 * sabit genişlikte (`sidebarWidth`, default 320), sağ main `flex-1`. Hem
 * `master` hem `detail` render edilir; `selectedDetail` yok sayılır
 * (tablet'te sidebar her zaman görünür; sidebar collapse 15C kapsam dışı —
 * V2'ye, `cards/[cardId]` sağ panel'i bu primitive'in dışından yönetilir).
 *
 * **Phone** (`useIsTablet() === false`): tek view. `selectedDetail` truthy ise
 * `detail`, aksi halde `fallback` (default `'master'`) tarafı render edilir.
 * Phone branch yeni stack frame açmaz — route üstü presentation'ı tüketen
 * ekran yönetir (`router.push('/cards/[cardId]')` mevcut akışı korunur;
 * detay için [`18-ipad-uyarlamasi.md`](../../../../docs/architecture/18-ipad-uyarlamasi.md) §4).
 *
 * Tablet branch'inde sidebar'ı main'den ayıran ince border `bg-border` token'ı
 * üzerine kuruludur (theme-aware). Sidebar arkaplanı `bg-card`, main
 * `bg-background` — Trello/Linear iPad pattern'i.
 */
export function MasterDetailLayout({
  master,
  detail,
  fallback = 'master',
  selectedDetail = false,
  sidebarWidth = 320,
  testID,
}: MasterDetailLayoutProps) {
  const isTablet = useIsTablet();

  if (isTablet) {
    return (
      <View testID={testID} className="flex-1 flex-row bg-background">
        <View
          testID={testID ? `${testID}-master` : undefined}
          className="border-r border-border bg-card"
          style={{ width: sidebarWidth }}
        >
          {master}
        </View>
        <View
          testID={testID ? `${testID}-detail` : undefined}
          className="flex-1 bg-background"
        >
          {detail}
        </View>
      </View>
    );
  }

  const showDetail = selectedDetail || fallback === 'detail';
  return (
    <View testID={testID} className="flex-1 bg-background">
      {showDetail ? detail : master}
    </View>
  );
}

'use client';

import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pusula/ui';
import { strings } from '@/lib/strings';

const ACCOUNT_TABS = ['profile', 'security', 'notifications'] as const;
type AccountTab = (typeof ACCOUNT_TABS)[number];

function isAccountTab(value: string | null | undefined): value is AccountTab {
  return value != null && (ACCOUNT_TABS as readonly string[]).includes(value);
}

type AccountTabsProps = {
  profile: ReactNode;
  security: ReactNode;
  notifications: ReactNode;
};

/**
 * /account 3-sekme container'ı (Faz 10C / DEM-137). Tab seçimi `?tab=` query
 * parametresinden okunur, değişimde `router.replace` ile URL güncellenir —
 * scroll bozulmaz, browser back/forward çalışır. Geçersiz query değerleri
 * varsayılan `profile` sekmesine düşer. UI primitive'leri için
 * `docs/architecture/15-bildirim-ayar-ekrani.md` §15.1 — i18n için
 * `strings.account.tabs.*`.
 */
export function AccountTabs({ profile, security, notifications }: AccountTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTab = searchParams.get('tab');
  const initialTab: AccountTab = isAccountTab(queryTab) ? queryTab : 'profile';

  const handleValueChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', value);
    const query = params.toString();
    router.replace(query ? `?${query}` : '?', { scroll: false });
  };

  return (
    <Tabs defaultValue={initialTab} onValueChange={handleValueChange} className="space-y-4">
      <TabsList>
        <TabsTrigger value="profile">{strings.account.tabs.profile}</TabsTrigger>
        <TabsTrigger value="security">{strings.account.tabs.security}</TabsTrigger>
        <TabsTrigger value="notifications">{strings.account.tabs.notifications}</TabsTrigger>
      </TabsList>
      <TabsContent value="profile" className="space-y-6">
        {profile}
      </TabsContent>
      <TabsContent value="security" className="space-y-6">
        {security}
      </TabsContent>
      <TabsContent value="notifications" className="space-y-6">
        {notifications}
      </TabsContent>
    </Tabs>
  );
}

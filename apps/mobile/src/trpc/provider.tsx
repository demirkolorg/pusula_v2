import type { ReactNode } from 'react';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Query } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import type { AppRouter } from '@pusula/api';
import { apiBaseUrl } from '@/lib/api-url';
import { authClient } from '@/lib/auth-client';
import { makeQueryClient } from './query-client';

/**
 * Paylaşılan tRPC sözleşmesi (`@pusula/api` `AppRouter`) üzerine kurulu mobil
 * istemci. Web `apps/web/src/trpc/client.tsx` ile aynı sözleşme; transport
 * `superjson`. Realtime mobilde yok (7.0 kararı: pull-to-refresh + push) —
 * yalnız HTTP batch link.
 */
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

function trpcUrl(): string {
  return `${apiBaseUrl}/trpc`;
}

/**
 * Cache persistence — AsyncStorage. Offline'da son görülen board/kart
 * görünür (7.0 kararı: okuma offline; mutation offline kuyruğu yok).
 * `superjson` ile serialize → Date vb. tipler restore'da korunur.
 */
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'pusula-query-cache',
  serialize: (client) => superjson.stringify(client),
  deserialize: (cached) => superjson.parse(cached),
});

/**
 * DEM-229 (P4 — performans): persist edilen query setini daralt.
 *
 * `PersistQueryClientProvider` varsayılan olarak TÜM query cache'ini
 * AsyncStorage'a `superjson` ile yazar; çok board gezilmiş bir kullanıcıda
 * `activity`/`comment`/`attachment.getDownloadUrl` gibi kısa-ömürlü ve hacimli
 * sorgular birikir, uygulama açılışında büyük bir deserialize maliyeti çıkar.
 *
 * Yalnız offline okuma için gerçekten kritik / uzun-ömürlü sorgular persist
 * edilir: gezinme iskeleti (`board.list`, `workspace.list`, `workspace.get`)
 * ve board verisinin kendisi (`board.get`). Geri kalan kart-alt sorguları
 * (yorum/aktivite/checklist/etiket/üye, ek indirme URL'leri vb.) persist
 * dışıdır — açık ekran zaten foreground'da yeniden çekilir, offline'da kart
 * detayının bayat alt verisi tutulmaz.
 *
 * tRPC tanstack-react-query query key'i `[[router, procedure], …]` şeklinde:
 * ilk segment iç içe bir dizi olup `[router, procedure]` yol parçalarını
 * taşır. Yol parçalarını birleştirip `'board.list'` gibi bir yola indirip
 * allowlist ile eşleriz. Beklenmedik key şekli (yol çıkarılamazsa) güvenli
 * tarafta persist EDİLMEZ — bilinmeyen veri AsyncStorage'ı şişirmesin.
 */
const PERSISTED_QUERY_PATHS: ReadonlySet<string> = new Set([
  'board.list',
  'board.get',
  'workspace.list',
  'workspace.get',
]);

/** tRPC query key'in ilk segmentinden `'router.procedure'` yolunu çıkarır. */
function queryPath(query: Query): string | null {
  const first = query.queryKey[0];
  if (!Array.isArray(first)) return null;
  const segments = first.filter((part): part is string => typeof part === 'string');
  return segments.length > 0 ? segments.join('.') : null;
}

/** Yalnız allowlist'teki uzun-ömürlü sorgular AsyncStorage'a yazılır. */
function shouldDehydrateQuery(query: Query): boolean {
  const path = queryPath(query);
  return path !== null && PERSISTED_QUERY_PATHS.has(path);
}

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: trpcUrl(),
          transformer: superjson,
          // Oturum aktarımı (Faz 7B): mobilde tarayıcı cookie jar'ı yok —
          // Better Auth Expo client oturum cookie'sini SecureStore'da tutar,
          // `getCookie()` onu `Cookie` başlığı olarak verir. Oturum yoksa
          // başlık eklenmez (istek kimliksiz gider).
          headers() {
            const cookie = authClient.getCookie();
            return cookie ? { Cookie: cookie } : {};
          },
        }),
      ],
    }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: { shouldDehydrateQuery },
      }}
    >
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </PersistQueryClientProvider>
  );
}

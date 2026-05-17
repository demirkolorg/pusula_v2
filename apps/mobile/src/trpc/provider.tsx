import type { ReactNode } from 'react';
import { useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import type { AppRouter } from '@pusula/api';
import { env } from '@/env';
import { makeQueryClient } from './query-client';

/**
 * Paylaşılan tRPC sözleşmesi (`@pusula/api` `AppRouter`) üzerine kurulu mobil
 * istemci. Web `apps/web/src/trpc/client.tsx` ile aynı sözleşme; transport
 * `superjson`. Realtime mobilde yok (7.0 kararı: pull-to-refresh + push) —
 * yalnız HTTP batch link.
 */
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

function trpcUrl(): string {
  return `${env.EXPO_PUBLIC_API_URL.replace(/\/$/, '')}/trpc`;
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
          // Oturum/cookie aktarımı 7B (Better Auth Expo) işidir; 7A'da
          // istek kimliksiz gider.
        }),
      ],
    }),
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
    >
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </PersistQueryClientProvider>
  );
}

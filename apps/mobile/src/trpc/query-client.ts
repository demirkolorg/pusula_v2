import { QueryClient } from '@tanstack/react-query';

/**
 * Mobil QueryClient. `gcTime` 24 saat — cache persistence (AsyncStorage)
 * restore'unda sorguların hayatta kalması için (7.0 kararı: okuma offline).
 * `staleTime` web ile aynı (30 sn) — kısa süre taze tut, gezinmede her şeyi
 * yeniden çekme.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        gcTime: 1000 * 60 * 60 * 24,
        retry: 2,
      },
    },
  });
}

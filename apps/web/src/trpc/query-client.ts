import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import superjson from 'superjson';

/** One QueryClient per request on the server, one per browser tab on the client. */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Drag-drop + realtime mean a lot of small reconciliations; keep data
        // briefly fresh so navigation doesn't refetch everything.
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}

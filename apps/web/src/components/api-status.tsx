'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';

/** Tiny widget that hits the `health` tRPC router to prove the web ↔ api wiring. */
export function ApiStatus() {
  const trpc = useTRPC();
  const ping = useQuery(trpc.health.ping.queryOptions());
  const db = useQuery(trpc.health.db.queryOptions());

  return (
    <div className="bg-card text-card-foreground w-full rounded-lg border px-4 py-3 text-left text-sm">
      <p className="text-muted-foreground mb-1 font-medium">API durumu</p>
      <ul className="space-y-1">
        <li>
          ping:{' '}
          {ping.isPending
            ? '…'
            : ping.isError
              ? `hata — ${ping.error.message}`
              : `ok @ ${ping.data.ts}`}
        </li>
        <li>
          db:{' '}
          {db.isPending
            ? '…'
            : db.isError
              ? `hata — ${db.error.message}`
              : `ok (${db.data.latencyMs} ms)`}
        </li>
      </ul>
    </div>
  );
}

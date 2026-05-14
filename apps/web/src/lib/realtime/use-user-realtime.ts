'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeEventEnvelope } from '@pusula/domain';
import { useSession } from '@/lib/auth-client';
import { useTRPC } from '@/trpc/client';
import { getRealtimeSocket, REALTIME_EVENT_CHANNEL } from './client';

const NOTIFICATIONS_LIMIT = 20;

export function useUserRealtime() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const filtersRef = useRef({
    list: trpc.notifications.list.infiniteQueryFilter({ limit: NOTIFICATIONS_LIMIT }),
    unreadCount: trpc.notifications.unreadCount.queryFilter(),
  });
  filtersRef.current = {
    list: trpc.notifications.list.infiniteQueryFilter({ limit: NOTIFICATIONS_LIMIT }),
    unreadCount: trpc.notifications.unreadCount.queryFilter(),
  };

  useEffect(() => {
    if (!userId) return;

    const socket = getRealtimeSocket();
    if (!socket.connected) socket.connect();

    const handleEvent = (envelope: RealtimeEventEnvelope): void => {
      if (envelope.type !== 'notification.created') return;

      void queryClient.invalidateQueries(filtersRef.current.list);
      void queryClient.invalidateQueries(filtersRef.current.unreadCount);
    };

    socket.on(REALTIME_EVENT_CHANNEL, handleEvent);

    return () => {
      socket.off(REALTIME_EVENT_CHANNEL, handleEvent);
    };
  }, [userId, queryClient]);
}

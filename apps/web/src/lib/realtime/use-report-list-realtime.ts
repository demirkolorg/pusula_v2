/**
 * Faz 13H (DEM-264) — render list realtime hook'u.
 *
 * 13I worker `pusula:report:render` channel'ına `report.render.completed`
 * / `report.render.failed` event'leri basar; `apps/api/src/socket/
 * report-render-bridge.ts` `user:{triggeredBy}` room'una emit eder.
 *
 * Bu hook socket'i join etmez (`useUserRealtime` zaten user room'a join);
 * sadece event listener ekler. Debounce 500ms (spec uyarısı — sınırsız
 * refetch yok). TanStack `report.listRenders.queryFilter` invalidate.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §10.3.
 */
'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getRealtimeSocket } from './client';
import { useTRPC } from '@/trpc/client';

// useQueryClient `useDebouncedInvalidate` içinde kullanılıyor.
void useQueryClient;

/** 13I bridge emit ettiği socket event isimleri. */
const EVENT_COMPLETED = 'report.render.completed';
const EVENT_FAILED = 'report.render.failed';

/** Event payload shape (bridge wire format'ı ile uyumlu). */
interface ReportRenderEventPayload {
  renderId: string;
  workspaceId: string;
  s3Key: string | null;
  errorMessage: string | null;
  at: string;
}

export interface UseReportListRealtimeArgs {
  workspaceId: string;
  /**
   * Manual hook çağrıldığında ek davranış (örn. toast göster). Default
   * yalnız listRenders invalidate.
   */
  onCompleted?: (event: ReportRenderEventPayload) => void;
  onFailed?: (event: ReportRenderEventPayload) => void;
}

/**
 * Debounce — burst event'lerde tek invalidate (örn. worker bir saniyede
 * 3 render bitirse 1 refetch yeter).
 */
function useDebouncedInvalidate(delay = 500) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef = useRef<Parameters<typeof queryClient.invalidateQueries>[0] | null>(null);

  const trigger = (filter: Parameters<typeof queryClient.invalidateQueries>[0]) => {
    filterRef.current = filter;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (filterRef.current) void queryClient.invalidateQueries(filterRef.current);
      timerRef.current = null;
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return trigger;
}

export function useReportListRealtime({
  workspaceId,
  onCompleted,
  onFailed,
}: UseReportListRealtimeArgs): void {
  const trpc = useTRPC();
  const debouncedInvalidate = useDebouncedInvalidate(500);
  const handlersRef = useRef({ onCompleted, onFailed });
  // code-review W2: render-time mutation React 18 strict-mode'da unsafe
  // (concurrent abort → stale ref). useEffect ile sync; queryClient dep
  // listeden çıktı (kullanılmıyor — debouncedInvalidate kendi içinde).
  useEffect(() => {
    handlersRef.current = { onCompleted, onFailed };
  }, [onCompleted, onFailed]);

  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket.connected) socket.connect();

    const handleCompleted = (payload: ReportRenderEventPayload) => {
      if (payload.workspaceId !== workspaceId) return;
      handlersRef.current.onCompleted?.(payload);
      debouncedInvalidate(trpc.report.listRenders.queryFilter({ workspaceId }));
    };
    const handleFailed = (payload: ReportRenderEventPayload) => {
      if (payload.workspaceId !== workspaceId) return;
      handlersRef.current.onFailed?.(payload);
      debouncedInvalidate(trpc.report.listRenders.queryFilter({ workspaceId }));
    };

    socket.on(EVENT_COMPLETED, handleCompleted);
    socket.on(EVENT_FAILED, handleFailed);

    return () => {
      socket.off(EVENT_COMPLETED, handleCompleted);
      socket.off(EVENT_FAILED, handleFailed);
    };
  }, [workspaceId, debouncedInvalidate, trpc]);
}

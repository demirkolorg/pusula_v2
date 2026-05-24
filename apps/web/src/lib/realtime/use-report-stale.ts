/**
 * Faz 13N (DEM-270) — `useReportStale` hook'u.
 *
 * Spec: docs/architecture/16-raporlama-mimarisi.md §7 + docs/domain/
 * 09-raporlama-kurallari.md §9.12.
 *
 * Açık rapor panelinin (composer preview / saved detay) socket event'i
 * `report.invalidated` ile stale state'ine düşmesi:
 *   1. `workspace:{id}` room'una `workspace:join` emit (Faz 5A pattern,
 *      Faz 13N rooms.ts handler).
 *   2. `report.invalidated` event'i dinle.
 *   3. `affectsWatchedScope` ile event'in açık raporu etkileyip
 *      etkilemediğini kontrol et (scope match).
 *   4. Etkiliyorsa `isStale=true` + `lastInvalidationAt` set; UI
 *      `<StaleBadge>` gösterir.
 *   5. Kullanıcı "Yenile" basınca `refresh()` → TanStack
 *      `report.preview` query invalidate → fresh dataset → rozet
 *      kaybolur. **Otomatik refresh YOK** (§9.12 — chart zıplaması).
 *
 * Disconnect davranışı: socket koparsa rozet sıfırlanmaz; reconnect
 * sonrası `connect` event'inde room'a yeniden join — biriken event'ler
 * kayıp (V1 kabul; V2 reconnect-time fresh fetch).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { BoardRoomAck } from '@pusula/domain';
import { useTRPC } from '@/trpc/client';
import { getRealtimeSocket } from './client';

/**
 * `report.invalidated` socket event payload — `@pusula/api/lib/report-
 * invalidation` `ReportInvalidatedSocketEvent` ile wire-uyumlu shape. Web
 * tarafında domain paketinden tip alabilirdik ama Faz 13N'i `@pusula/api`
 * client bundle'a bağlamamak için minimal local tip.
 */
export interface ReportInvalidatedEvent {
  at: string;
  scopeKinds: ReadonlyArray<'card' | 'list' | 'board' | 'workspace'>;
  workspaceId: string;
  boardId?: string;
  listId?: string;
  cardId?: string;
  eventType: string;
}

/** Hook'un açık rapor kapsamını eşleştirmek için ihtiyaç duyduğu scope. */
export type WatchedReportScope =
  | { kind: 'card'; cardId: string; boardId: string; workspaceId: string }
  | { kind: 'list'; listId: string; boardId: string; workspaceId: string }
  | { kind: 'board'; boardId: string; workspaceId: string }
  | { kind: 'workspace'; workspaceId: string };

export interface UseReportStaleArgs {
  /**
   * Workspace id — `workspace:{id}` room'a join + event'lerin root
   * eşleşmesi için. `null/undefined` ise hook devre dışı (socket'e
   * dokunmaz; isStale her zaman false).
   */
  workspaceId: string | null | undefined;
  /**
   * İzlenen rapor scope'u — event affects-check için. Değiştiğinde
   * mevcut stale state sıfırlanır (yeni rapor → eski stale alakasız).
   */
  watchedScope: WatchedReportScope | null;
  /**
   * Stale tetiklendiğinde otomatik olarak invalidate edilecek TanStack
   * query filter'ları. Default davranış `refresh()` çağrılınca
   * `report.preview` + `report.getSaved` invalidate. Test/caller bu
   * davranışı genişletebilir.
   */
  extraInvalidateFilters?: Array<Parameters<
    ReturnType<typeof useQueryClient>['invalidateQueries']
  >[0]>;
}

export interface UseReportStaleReturn {
  isStale: boolean;
  /** Son `report.invalidated` event'in ISO zamanı (tooltip için). */
  lastInvalidationAt: string | null;
  /**
   * Bağlantı durumu — `false` ise disconnect indicator. Initial mount
   * 'true' (socket henüz kontrol edilmeden önce optimistic).
   */
  connected: boolean;
  /**
   * Workspace room'a join handshake ack'i geldi mi. Production'da
   * permission resolver `Forbidden` derse `false` kalır (board-only
   * kullanıcı vb.) — UI bu durumda stale rozeti hiç görmez.
   */
  joined: boolean;
  /** Kullanıcının "Yenile" tıklaması; preview query'i invalidate + rozet temizler. */
  refresh: () => void;
  /** Rozeti gizlemek için (X butonu vb.). */
  dismiss: () => void;
}

/**
 * V1 scope match semantiği (§7 tablosu):
 *   - workspace scope: aynı workspaceId payload'unun **tüm** event'leri
 *   - board scope: payload.boardId === watched.boardId
 *   - list scope: payload.listId === watched.listId
 *   - card scope: payload.cardId === watched.cardId
 *
 * V2: list-scope için card.* event'lerinin listId taşıması (13E payload
 * enrichment).
 */
export function affectsWatchedScope(
  event: ReportInvalidatedEvent,
  watched: WatchedReportScope,
): boolean {
  // Root: workspace match shart — başka workspace event'i hiç alakasız.
  if (event.workspaceId !== watched.workspaceId) return false;

  switch (watched.kind) {
    case 'workspace':
      // Workspace raporu altındaki her şeyi agregat eder — root match yeterli.
      return true;
    case 'board':
      return event.boardId === watched.boardId;
    case 'list':
      return event.listId === watched.listId;
    case 'card':
      return event.cardId === watched.cardId;
  }
}

const EVENT_NAME = 'report.invalidated';

/**
 * Hook implementasyonu. `workspaceId` null → no-op (disabled). Watched
 * scope değişimi → stale state reset. Cleanup'ta `workspace:leave` emit
 * (server room üyelik sayısı doğru kalır).
 */
export function useReportStale(args: UseReportStaleArgs): UseReportStaleReturn {
  const { workspaceId, watchedScope } = args;
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const [isStale, setIsStale] = useState(false);
  const [lastInvalidationAt, setLastInvalidationAt] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(true);
  const [joined, setJoined] = useState<boolean>(false);

  // watchedScope ref — handler stale-closure engelle; scope değişiminde state reset.
  // Identity türetmesi tek string'e çevrilmiş (code-review M2 nit): okunabilirlik
  // + deps array stabilitesi. JSON.stringify deterministik çünkü scope shape
  // küçük + key set'i sabit (discriminated union).
  const watchedScopeRef = useRef<WatchedReportScope | null>(watchedScope);
  // `watchedScope` ref'i her render'da güncellenir; identity-key değişimi
  // (`watchedScopeIdentity`) state reset için kullanılır. JSON.stringify
  // deterministik çünkü scope shape küçük + discriminated union (sabit
  // key set'i). Aynı identity → effect re-run yok.
  const watchedScopeIdentity = watchedScope ? JSON.stringify(watchedScope) : null;
  watchedScopeRef.current = watchedScope;
  useEffect(() => {
    if (watchedScopeIdentity === null) return;
    // Yeni rapor açıldı — eski stale bayrağı alakasız.
    setIsStale(false);
    setLastInvalidationAt(null);
  }, [watchedScopeIdentity]);

  // extraInvalidateFilters ref pattern — code-review H1: caller her render
  // yeni array literal verebilir; `refresh` callback referansı stable kalmalı
  // ki effect döngüsü olmasın. Ref güncel kalır, callback `current`'u okur.
  const extraFiltersRef = useRef(args.extraInvalidateFilters);
  useEffect(() => {
    extraFiltersRef.current = args.extraInvalidateFilters;
  }, [args.extraInvalidateFilters]);

  useEffect(() => {
    if (!workspaceId) {
      setJoined(false);
      return;
    }
    const socket = getRealtimeSocket();
    if (!socket.connected) socket.connect();

    let active = true;
    let joinedRoom = false;

    const handleConnect = () => {
      if (!active) return;
      setConnected(true);
      setJoined(false);
      socket.emit(
        'workspace:join',
        { workspaceId },
        (ack?: BoardRoomAck) => {
          if (!active) return;
          if (!ack?.ok) {
            // Permission denied (board-only kullanıcı) veya bad request →
            // joined=false kalır; hook bu durumda hiç event almaz.
            setJoined(false);
            console.warn(
              `[realtime] workspace:join rejected for ${workspaceId}: ${ack?.error ?? 'unknown'}`,
            );
            return;
          }
          joinedRoom = true;
          setJoined(true);
        },
      );
    };

    const handleDisconnect = () => {
      setConnected(false);
      // joined state'i koru — reconnect handleConnect ile re-join eder
      // ama UI tarafından rozet sıfırlanmasın diye joined=false yapmıyoruz.
      joinedRoom = false;
    };

    const handleEvent = (payload: ReportInvalidatedEvent) => {
      const scope = watchedScopeRef.current;
      if (!scope) return;
      if (!affectsWatchedScope(payload, scope)) return;
      // Re-render guard: zaten stale ise tekrar setState yapma.
      setIsStale((prev) => {
        if (prev) return prev;
        return true;
      });
      setLastInvalidationAt(payload.at);
    };

    socket.on(EVENT_NAME, handleEvent);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      active = false;
      socket.off(EVENT_NAME, handleEvent);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      if (joinedRoom) {
        socket.emit('workspace:leave', { workspaceId });
      }
    };
  }, [workspaceId]);

  const refresh = useCallback(() => {
    // `report.preview` ve `report.getSaved` query'lerini invalidate et —
    // active query'ler refetch eder, idle olanlar bir sonraki mount'ta
    // fresh data alır. `keepPreviousData` ile flicker engellenir
    // (composer/detail query config'inde mevcut).
    void queryClient.invalidateQueries(trpc.report.preview.pathFilter());
    void queryClient.invalidateQueries(trpc.report.getSaved.pathFilter());
    for (const filter of extraFiltersRef.current ?? []) {
      void queryClient.invalidateQueries(filter);
    }
    setIsStale(false);
    setLastInvalidationAt(null);
  }, [queryClient, trpc]);

  const dismiss = useCallback(() => {
    setIsStale(false);
    setLastInvalidationAt(null);
  }, []);

  return {
    isStale,
    lastInvalidationAt,
    connected,
    joined,
    refresh,
    dismiss,
  };
}

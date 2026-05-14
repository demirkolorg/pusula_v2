import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEventEnvelope } from '@pusula/domain';

type Listener = (...args: unknown[]) => void;

class FakeSocket {
  connected = false;
  listeners = new Map<string, Set<Listener>>();

  connect(): this {
    this.connected = true;
    return this;
  }

  on(event: string, listener: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, listener?: Listener): this {
    if (!listener) {
      this.listeners.delete(event);
    } else {
      this.listeners.get(event)?.delete(listener);
    }
    return this;
  }

  trigger(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      listener(...args);
    }
  }
}

let fakeSocket: FakeSocket;
let sessionUserId: string | undefined;

vi.mock('./client', () => ({
  getRealtimeSocket: () => fakeSocket,
  REALTIME_EVENT_CHANNEL: 'realtime:event',
}));

vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({
    data: sessionUserId ? { user: { id: sessionUserId } } : null,
  }),
}));

const listFilter = { queryKey: ['notifications.list', { limit: 20 }], type: 'infinite' } as const;
const unreadFilter = { queryKey: ['notifications.unreadCount'], type: 'query' } as const;

vi.mock('@/trpc/client', () => ({
  useTRPC: () => ({
    notifications: {
      list: {
        infiniteQueryFilter: () => listFilter,
      },
      unreadCount: {
        queryFilter: () => unreadFilter,
      },
    },
  }),
}));

import { useUserRealtime } from './use-user-realtime';

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(qc: QueryClient): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

function envelope(type: string): RealtimeEventEnvelope {
  return {
    id: `evt_${type}`,
    type,
    workspaceId: 'ws1',
    boardId: undefined,
    actorUserId: 'u2',
    seq: 1,
    payload: {},
    createdAt: new Date().toISOString(),
  };
}

describe('useUserRealtime', () => {
  beforeEach(() => {
    fakeSocket = new FakeSocket();
    sessionUserId = 'user_1';
  });

  it('mounts the user realtime listener and connects the singleton socket', () => {
    const qc = newQueryClient();

    renderHook(() => useUserRealtime(), { wrapper: wrap(qc) });

    expect(fakeSocket.connected).toBe(true);
    expect(fakeSocket.listeners.get('realtime:event')?.size).toBe(1);
  });

  it('invalidates notification list and unread-count caches for notification.created only', async () => {
    const qc = newQueryClient();
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    renderHook(() => useUserRealtime(), { wrapper: wrap(qc) });

    await act(async () => {
      fakeSocket.trigger('realtime:event', envelope('card.updated'));
    });

    expect(invalidate).not.toHaveBeenCalled();

    await act(async () => {
      fakeSocket.trigger('realtime:event', envelope('notification.created'));
    });

    expect(invalidate).toHaveBeenCalledWith(listFilter);
    expect(invalidate).toHaveBeenCalledWith(unreadFilter);
  });

  it('detaches the realtime listener on unmount', () => {
    const qc = newQueryClient();
    const { unmount } = renderHook(() => useUserRealtime(), { wrapper: wrap(qc) });

    unmount();

    expect(fakeSocket.listeners.get('realtime:event')?.size ?? 0).toBe(0);
  });

  it('does nothing until a session user id is available', () => {
    const qc = newQueryClient();
    sessionUserId = undefined;

    renderHook(() => useUserRealtime(), { wrapper: wrap(qc) });

    expect(fakeSocket.connected).toBe(false);
    expect(fakeSocket.listeners.get('realtime:event')?.size ?? 0).toBe(0);
  });
});

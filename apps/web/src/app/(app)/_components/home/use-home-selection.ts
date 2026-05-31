'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-driven selection state for the home Gezgin (§13.11). Reads `ws` / `board`
 * / `list` search params and exposes setters that cascade-clear the tail:
 *
 * - `setWorkspace(id)` → writes `ws`, drops `board` + `list`.
 * - `setBoard(id)` → writes `board`, drops `list`.
 * - `setList(id)` → writes `list`.
 * - Any setter with `null` clears that level and below.
 *
 * All writes go through `router.replace` so drill-down doesn't shift history;
 * the back button keeps meaning "leave the home page", not "undo the column
 * click". Search-param mutations are scroll-stable.
 */
export type HomeSelection = {
  workspaceId: string | null;
  boardId: string | null;
  listId: string | null;
};

export type UseHomeSelectionResult = HomeSelection & {
  setWorkspace: (id: string | null) => void;
  setBoard: (id: string | null) => void;
  setList: (id: string | null) => void;
};

export function useHomeSelection(): UseHomeSelectionResult {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const selection = useMemo<HomeSelection>(
    () => ({
      workspaceId: params.get('ws'),
      boardId: params.get('board'),
      listId: params.get('list'),
    }),
    [params],
  );

  const write = useCallback(
    (next: HomeSelection) => {
      const sp = new URLSearchParams(params);
      const apply = (key: 'ws' | 'board' | 'list', value: string | null) => {
        if (value) sp.set(key, value);
        else sp.delete(key);
      };
      apply('ws', next.workspaceId);
      apply('board', next.boardId);
      apply('list', next.listId);
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const setWorkspace = useCallback(
    (id: string | null) => {
      write({ workspaceId: id, boardId: null, listId: null });
    },
    [write],
  );

  const setBoard = useCallback(
    (id: string | null) => {
      write({ workspaceId: selection.workspaceId, boardId: id, listId: null });
    },
    [selection.workspaceId, write],
  );

  const setList = useCallback(
    (id: string | null) => {
      write({
        workspaceId: selection.workspaceId,
        boardId: selection.boardId,
        listId: id,
      });
    },
    [selection.workspaceId, selection.boardId, write],
  );

  return { ...selection, setWorkspace, setBoard, setList };
}

import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useHomeSelection } from './use-home-selection';

const replaceMock = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

describe('useHomeSelection', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    currentSearch = '';
  });

  it('reads ws/board/list params from the URL', () => {
    currentSearch = 'ws=w1&board=b1&list=l1';
    const { result } = renderHook(() => useHomeSelection());
    expect(result.current.workspaceId).toBe('w1');
    expect(result.current.boardId).toBe('b1');
    expect(result.current.listId).toBe('l1');
  });

  it('returns nulls when no params are present', () => {
    const { result } = renderHook(() => useHomeSelection());
    expect(result.current.workspaceId).toBeNull();
    expect(result.current.boardId).toBeNull();
    expect(result.current.listId).toBeNull();
  });

  it('setWorkspace writes ws and drops board + list', () => {
    currentSearch = 'ws=w1&board=b1&list=l1';
    const { result } = renderHook(() => useHomeSelection());
    act(() => result.current.setWorkspace('w2'));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/?ws=w2', { scroll: false });
  });

  it('setBoard keeps ws and drops list', () => {
    currentSearch = 'ws=w1&board=b1&list=l1';
    const { result } = renderHook(() => useHomeSelection());
    act(() => result.current.setBoard('b2'));
    expect(replaceMock).toHaveBeenCalledWith('/?ws=w1&board=b2', { scroll: false });
  });

  it('setList writes list and keeps ws + board', () => {
    currentSearch = 'ws=w1&board=b1';
    const { result } = renderHook(() => useHomeSelection());
    act(() => result.current.setList('l1'));
    expect(replaceMock).toHaveBeenCalledWith('/?ws=w1&board=b1&list=l1', { scroll: false });
  });

  it('setWorkspace(null) clears the entire selection', () => {
    currentSearch = 'ws=w1&board=b1&list=l1';
    const { result } = renderHook(() => useHomeSelection());
    act(() => result.current.setWorkspace(null));
    expect(replaceMock).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('setBoard(null) drops board + list but keeps ws', () => {
    currentSearch = 'ws=w1&board=b1&list=l1';
    const { result } = renderHook(() => useHomeSelection());
    act(() => result.current.setBoard(null));
    expect(replaceMock).toHaveBeenCalledWith('/?ws=w1', { scroll: false });
  });

  it('preserves unrelated search params', () => {
    currentSearch = 'ws=w1&keep=yes';
    const { result } = renderHook(() => useHomeSelection());
    act(() => result.current.setBoard('b1'));
    // Mevcut URLSearchParams sırası: ws, keep, board (set ile sona eklenir).
    expect(replaceMock).toHaveBeenCalledTimes(1);
    const [url] = replaceMock.mock.calls[0]!;
    expect(url).toContain('ws=w1');
    expect(url).toContain('keep=yes');
    expect(url).toContain('board=b1');
  });
});

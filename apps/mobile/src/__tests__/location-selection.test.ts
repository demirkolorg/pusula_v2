import { describe, expect, it } from 'vitest';
import {
  applyBoard,
  applyList,
  applyWorkspace,
  selectionComplete,
  type LocationSelection,
} from '../lib/location-selection';

/**
 * DEM-203 WP7 — kademeli konum seçici saf state mantığı birim testleri
 * (`LocationPicker`/`useLocationPicker`'tan ayrıştırılmış `lib/location-selection`).
 */

const ws = { id: 'ws-1', name: 'Çalışma Alanı' };
const ws2 = { id: 'ws-2', name: 'İkinci Alan' };
const board = { id: 'b-1', title: 'Pano' };
const board2 = { id: 'b-2', title: 'İkinci Pano' };
const list = { id: 'l-1', title: 'Liste' };

describe('selectionComplete', () => {
  it('seçim null → her depth için false', () => {
    expect(selectionComplete('workspace', null)).toBe(false);
    expect(selectionComplete('board', null)).toBe(false);
    expect(selectionComplete('list', null)).toBe(false);
  });

  it('depth="workspace" → workspace seçiliyse yeterli', () => {
    expect(selectionComplete('workspace', applyWorkspace(ws))).toBe(true);
  });

  it('depth="board" → board seçilene kadar tamamlanmamış', () => {
    const wsOnly = applyWorkspace(ws);
    expect(selectionComplete('board', wsOnly)).toBe(false);
    expect(selectionComplete('board', applyBoard(wsOnly, board))).toBe(true);
  });

  it('depth="list" → list seçilene kadar tamamlanmamış', () => {
    const withBoard = applyBoard(applyWorkspace(ws), board);
    expect(selectionComplete('list', withBoard)).toBe(false);
    expect(selectionComplete('list', applyList(withBoard, list))).toBe(true);
  });
});

describe('applyWorkspace', () => {
  it('yalnız workspace alanlarını içeren taze seçim üretir', () => {
    expect(applyWorkspace(ws)).toEqual({
      workspaceId: 'ws-1',
      workspaceName: 'Çalışma Alanı',
    });
  });
});

describe('applyBoard', () => {
  it('workspace seçili değilse (null) seçim değişmez', () => {
    expect(applyBoard(null, board)).toBeNull();
  });

  it('board alanlarını ekler, workspace alanlarını korur', () => {
    const next = applyBoard(applyWorkspace(ws), board);
    expect(next).toEqual({
      workspaceId: 'ws-1',
      workspaceName: 'Çalışma Alanı',
      boardId: 'b-1',
      boardTitle: 'Pano',
    });
  });

  it('board değişince mevcut list seçimi temizlenir', () => {
    const full: LocationSelection = {
      workspaceId: 'ws-1',
      workspaceName: 'Çalışma Alanı',
      boardId: 'b-1',
      boardTitle: 'Pano',
      listId: 'l-1',
      listTitle: 'Liste',
    };
    const next = applyBoard(full, board2);
    expect(next?.boardId).toBe('b-2');
    expect(next?.listId).toBeUndefined();
    expect(next?.listTitle).toBeUndefined();
  });
});

describe('applyList', () => {
  it('board seçili değilse (workspace-only) seçim değişmez', () => {
    const wsOnly = applyWorkspace(ws);
    expect(applyList(wsOnly, list)).toBe(wsOnly);
  });

  it('seçim null ise değişmez', () => {
    expect(applyList(null, list)).toBeNull();
  });

  it('board seçiliyse list alanlarını ekler', () => {
    const next = applyList(applyBoard(applyWorkspace(ws), board), list);
    expect(next).toEqual({
      workspaceId: 'ws-1',
      workspaceName: 'Çalışma Alanı',
      boardId: 'b-1',
      boardTitle: 'Pano',
      listId: 'l-1',
      listTitle: 'Liste',
    });
  });
});

describe('kademeli temizleme — üst seviye değişince alt seviyeler düşer', () => {
  it('workspace değişince board + list tamamen sıfırlanır', () => {
    // Tam seçim: ws → board → list.
    let selection = applyList(applyBoard(applyWorkspace(ws), board), list);
    expect(selection?.listId).toBe('l-1');

    // applyWorkspace mevcut seçimden bağımsız taze seçim üretir → board/list yok.
    selection = applyWorkspace(ws2);
    expect(selection).toEqual({ workspaceId: 'ws-2', workspaceName: 'İkinci Alan' });
    expect(selection.boardId).toBeUndefined();
    expect(selection.listId).toBeUndefined();
  });

  it('board değişince list düşer ama workspace korunur', () => {
    const full = applyList(applyBoard(applyWorkspace(ws), board), list);
    const next = applyBoard(full, board2);
    expect(next?.workspaceId).toBe('ws-1');
    expect(next?.boardId).toBe('b-2');
    expect(next?.listId).toBeUndefined();
  });
});

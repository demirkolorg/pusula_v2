/**
 * DEM-203 — kademeli konum seçici (workspace → pano → liste) saf state mantığı.
 *
 * `LocationPicker` bileşeninden ayrıştırılmış saf fonksiyonlar — birim testi
 * React/RN bağımlılığı olmadan çalışsın diye buraya çıkarıldı. `useLocationPicker`
 * hook'u bu geçiş fonksiyonlarını `useState` üzerinde uygular; bileşen davranışı
 * değişmez.
 */

/** Hangi seviyeye kadar seçim isteneceği. */
export type LocationPickerDepth = 'workspace' | 'board' | 'list';

/** Tamamlanmış (en azından workspace seçili) bir seçim. */
export type LocationSelection = {
  workspaceId: string;
  workspaceName: string;
  boardId?: string;
  boardTitle?: string;
  listId?: string;
  listTitle?: string;
};

/** `depth`'e göre seçimin tamamlanıp tamamlanmadığını belirler. */
export function selectionComplete(
  depth: LocationPickerDepth,
  selection: LocationSelection | null,
): boolean {
  if (!selection) return false;
  if (depth === 'workspace') return true;
  if (depth === 'board') return selection.boardId !== undefined;
  return selection.listId !== undefined;
}

/**
 * Workspace seçimini uygular — workspace değişince board + list seçimleri
 * geçersizdir, sıfırlanır (tutarsız `{ workspaceId, boardId }` çifti oluşmaz).
 */
export function applyWorkspace(workspace: { id: string; name: string }): LocationSelection {
  return { workspaceId: workspace.id, workspaceName: workspace.name };
}

/**
 * Board seçimini uygular — board değişince list seçimi geçersizdir, sıfırlanır.
 * Henüz workspace seçili değilse (`current` null) seçim değişmez.
 */
export function applyBoard(
  current: LocationSelection | null,
  board: { id: string; title: string },
): LocationSelection | null {
  if (!current) return current;
  return {
    workspaceId: current.workspaceId,
    workspaceName: current.workspaceName,
    boardId: board.id,
    boardTitle: board.title,
  };
}

/**
 * List seçimini uygular. Henüz board seçili değilse seçim değişmez.
 */
export function applyList(
  current: LocationSelection | null,
  list: { id: string; title: string },
): LocationSelection | null {
  if (!current?.boardId) return current;
  return { ...current, listId: list.id, listTitle: list.title };
}

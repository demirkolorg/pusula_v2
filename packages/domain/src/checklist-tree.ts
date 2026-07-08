/**
 * İç içe (nested) checklist maddeleri için saf ağaç yardımcıları (DEM — 3
 * seviye). Depolama düzdür: her madde `parentItemId` (kök için `null`) + kardeşler
 * arası `position` taşır. Sunucu maddeleri düz döndürür; istemci (web + mobil)
 * bu yardımcılarla ağaç kurar. Framework-bağımsız, saf — bu yüzden `@pusula/domain`.
 *
 * `position` YALNIZ aynı ebeveyn (kardeşler) arasında anlamlıdır; ağaç kurulurken
 * her düzey kendi içinde `comparePosition` ile sıralanır.
 */
import { comparePosition } from './position';

/** Ağaç kurmak için bir maddenin ihtiyaç duyulan minimum alanları. */
export type ChecklistTreeItem = {
  id: string;
  parentItemId?: string | null;
  position: string;
};

/** Bir madde + `children` alt ağacı (kardeşler `position` sıralı). */
export type ChecklistTreeNode<T extends ChecklistTreeItem> = T & {
  children: Array<ChecklistTreeNode<T>>;
  /** Kökten itibaren 0 tabanlı derinlik (kök = 0). Girinti + sınır için türetilir. */
  depth: number;
};

/**
 * Düz madde listesinden iç içe ağaç kurar. Her düzeydeki kardeşler `position`'a
 * göre sıralanır. Ebeveyni listede bulunmayan (orphan — örn. ebeveyni yeni
 * silinmiş ama alt madde henüz cache'ten düşmemiş) maddeler köke çıkarılır ki
 * kaybolmasınlar. Mutate etmez; girdi maddelerini kopyalayıp `children`/`depth`
 * ekler.
 */
export function buildChecklistTree<T extends ChecklistTreeItem>(
  items: readonly T[],
): Array<ChecklistTreeNode<T>> {
  const nodeById = new Map<string, ChecklistTreeNode<T>>();
  for (const item of items) {
    nodeById.set(item.id, { ...item, children: [], depth: 0 });
  }

  const roots: Array<ChecklistTreeNode<T>> = [];
  for (const item of items) {
    const node = nodeById.get(item.id);
    if (!node) continue;
    const parentId = item.parentItemId ?? null;
    const parent = parentId != null ? nodeById.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortAndStampDepth = (nodes: Array<ChecklistTreeNode<T>>, depth: number): void => {
    nodes.sort((a, b) => comparePosition(a.position, b.position));
    for (const node of nodes) {
      node.depth = depth;
      sortAndStampDepth(node.children, depth + 1);
    }
  };
  sortAndStampDepth(roots, 0);

  return roots;
}

/**
 * Bir maddenin tüm alt ağacının (kendisi HARİÇ) id'lerini toplar — düz listeden,
 * `parentItemId` bağlarını izleyerek. Silme sırasında `on delete cascade` ile
 * birlikte gidecek çocukları peer'lara (realtime) / optimistic cache'e bildirmek
 * için. Döngüye karşı `seen` ile korunur (kendi kendine referans zinciri).
 */
export function collectDescendantItemIds(
  items: readonly { id: string; parentItemId?: string | null }[],
  rootItemId: string,
): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const item of items) {
    const parentId = item.parentItemId ?? null;
    if (parentId == null) continue;
    const bucket = childrenByParent.get(parentId);
    if (bucket) bucket.push(item.id);
    else childrenByParent.set(parentId, [item.id]);
  }

  const result: string[] = [];
  const seen = new Set<string>([rootItemId]);
  const stack = [...(childrenByParent.get(rootItemId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    const kids = childrenByParent.get(id);
    if (kids) stack.push(...kids);
  }
  return result;
}

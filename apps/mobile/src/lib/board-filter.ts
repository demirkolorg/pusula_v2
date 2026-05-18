/**
 * Faz 7E-2 (DEM-200) — board ekranı etiket filtresinin saf (yan etkisiz)
 * yardımcıları. Web `apps/web/.../board-filter.ts` etiket helper'larının mobil
 * karşılığı: filtre tamamen istemci tarafıdır — `board.get` Faz 2.7'den (DEM-63)
 * beri her kart için `labels` taşır, yeni backend yok.
 *
 * Saf modül olduğundan birim test edilir (`__tests__/board-filter.test.ts`).
 */

/**
 * Filtre için gereken minimum kart şekli — board kartı bunu sağlar.
 * `labelId`, `labels` tablosunun PK'sıdır; `LabelFilterSheet`'in seçime
 * koyduğu `label.list` çıktısındaki `label.id` ile aynı değerdir.
 */
type CardWithLabels = { labels: readonly { labelId: string }[] };

/**
 * `card` etiket filtresinden geçer mi? Hiç etiket seçili değilse her kart geçer;
 * aksi halde kart seçili etiketlerden **en az birini** taşıyorsa geçer (OR
 * semantiği — web DEM-54 davranışıyla aynı).
 */
export function cardPassesLabelFilter(
  card: CardWithLabels,
  selectedLabelIds: ReadonlySet<string>,
): boolean {
  if (selectedLabelIds.size === 0) return true;
  return card.labels.some((label) => selectedLabelIds.has(label.labelId));
}

/**
 * Kart listesini seçili etiket id'lerine göre filtreler (bkz.
 * {@link cardPassesLabelFilter}). Hiç etiket seçili değilse kartların bir
 * kopyası döner — çağıran diziyi mutate etmez.
 */
export function filterCardsByLabels<T extends CardWithLabels>(
  cards: readonly T[],
  selectedLabelIds: ReadonlySet<string>,
): T[] {
  if (selectedLabelIds.size === 0) return [...cards];
  return cards.filter((card) => cardPassesLabelFilter(card, selectedLabelIds));
}

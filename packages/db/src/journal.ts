/**
 * Drizzle migration journal bütünlük kontrolü.
 *
 * Drizzle bir migration'ın "pending" olup olmadığına `_journal.json`'daki
 * `when` zaman damgasına bakarak karar verir: yeni migration'ın `when`'i
 * son uygulanan migration'ınkinden KÜÇÜKSE Drizzle onu "zaten uygulanmış"
 * sayar ve **sessizce atlar** — tablo hiç oluşmaz (üretim olayı DEM-205,
 * 2026-05-19: `quick_notes` tablosu canlıda oluşmadı).
 *
 * `drizzle-kit generate` `when`'i gerçek `Date.now()` ile damgalar. Bazı eski
 * migration'lar elle gelecek-tarihli yazıldığı için, taze üretilen bir
 * migration onların ALTINA düşebilir. Her `pnpm db:generate` sonrası yeni
 * entry'nin `when` değerinin `_journal.json`'daki en büyük değer olduğunu
 * doğrula; değilse mevcut en üst değerin üzerine elle çek.
 */
import { readFileSync } from 'node:fs';

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

interface Journal {
  entries: JournalEntry[];
}

/**
 * `_journal.json` migration zaman damgaları `idx` sırasında kesin artan
 * değilse hata fırlatır. Monotonik olmayan journal, Drizzle'ın migration'ları
 * sessizce atlamasına yol açar — yukarıdaki modül açıklamasına bakın.
 */
export function assertJournalMonotonic(journalPath: string): void {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  const entries = [...journal.entries].sort((a, b) => a.idx - b.idx);

  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];
    if (!prev || !curr) continue;
    if (curr.when <= prev.when) {
      throw new Error(
        `[db] _journal.json bozuk: "${curr.tag}" (when=${curr.when}) bir önceki ` +
          `"${prev.tag}" (when=${prev.when}) değerinden küçük/eşit. Drizzle bu ` +
          `migration'ı sessizce atlar. Düzeltme: _journal.json'da "${curr.tag}" ` +
          `entry'sinin "when" değerini ${prev.when + 1} veya üzerine çek.`,
      );
    }
  }
}

/**
 * Public API + Bot Erişimi (Task 3) — REST çıktısı serileştirme.
 *
 * tRPC server-side caller düz JS objeleri döndürür (superjson wire-format
 * yalnız HTTP tRPC endpoint'inde devrededir; caller yolunda transformer
 * çalışmaz). REST tüketicisi bir AI botudur ve makine-okur, kararlı JSON
 * bekler; bu yüzden çıktı `c.json` öncesi normalize edilir:
 *
 *  - `Date` → ISO 8601 string (`toISOString()`). Aksi halde `c.json` Date'i
 *    yine ISO'ya çevirir ama derin/tutarlı davranışı garanti etmek + niyeti
 *    açık kılmak için burada yaparız.
 *  - `undefined` alanlar objelerden **atılır** (JSON'da anahtar hiç görünmez;
 *    `c.json` de undefined'ları düşürür, burada da simetrik davranırız).
 *
 * superjson **kullanılmaz** — bkz. plan "Mimari karar özeti" (caller düz obje
 * döner).
 */

/** Derin dolaşarak `Date`→ISO string çevirir ve `undefined` obje alanlarını atar. */
export function serializeForPublicApi(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => serializeForPublicApi(item));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      out[key] = serializeForPublicApi(item);
    }
    return out;
  }
  return value;
}

/**
 * Faz 13E — Rapor dataset cache interface + Redis implementasyonu
 * (DEM-261). 13D NoOp interface'i üzerine `buildRedisReportCache`
 * eklenir; host (`apps/api`) ioredis instance'ını verir, yoksa NoOp
 * fallback. Cache key + pattern helper'ları aynı dosyada — invalidator
 * worker da bunları import eder.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.7.
 */
import { createHash } from 'node:crypto';
import type { ComparisonConfig, ReportFilters, ReportScope, ReportScopeKind } from '@pusula/domain/reports';

/**
 * `buildRedisReportCache`'in ihtiyaç duyduğu minimal Redis surface.
 * `@pusula/api` paketi `ioredis`'i runtime dependency olarak taşımaz
 * (host concern); `apps/api` veya `apps/worker` ioredis instance'ı verir,
 * structural type bu interface ile eşleşir. Paket bağımsızlığı +
 * ioredis API surface kontrolü.
 */
export interface RedisCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ex: 'EX', ttlSeconds: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    match: 'MATCH',
    pattern: string,
    count: 'COUNT',
    n: number,
  ): Promise<[string, string[]]>;
}

export interface ReportCache {
  /** Anahtardan dataset getir. NoOp → her zaman null. */
  get<T = unknown>(key: string): Promise<T | null>;
  /** Dataset'i TTL ile yaz. NoOp → no-op. */
  set<T = unknown>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /**
   * Pattern (SCAN) ile silme — outbox-driven invalidator (13E worker)
   * tarafından kullanılır. Silinen key sayısını döner.
   */
  invalidatePattern(pattern: string): Promise<number>;
}

// ─── TTL tablosu (§16.7) ────────────────────────────────────────────────────

/**
 * Scope-bazlı TTL (saniye). Spec §16.7:
 *   card 60 / list 90 / board 180 / workspace 300 / PDF dataset 600.
 */
export const REPORT_CACHE_TTL_SECONDS: Readonly<Record<ReportScopeKind | 'pdfDataset', number>> =
  Object.freeze({
    card: 60,
    list: 90,
    board: 180,
    workspace: 300,
    pdfDataset: 600,
  });

// ─── Key + pattern helper'ları ──────────────────────────────────────────────

const KEY_VERSION = 'v1';
const KEY_PREFIX = 'report:dataset';

/**
 * Cache key segment whitelist (DEM-261 security review HIGH-1). Redis
 * glob meta karakterleri (`*` `?` `[` `]`) ve field separator (`:`)
 * concatenation'da namespace bütünlüğünü kırabilir; whitespace + diğer
 * kontrol karakterleri de hariç. `.` ve `-` safe — preset id'ler
 * dotted (`board.health`) + nanoid `-` içerebilir.
 *
 * `idSchema` (`@pusula/domain/schemas/common`) şu an
 * `z.string().min(1).max(64)` — format kısıtı yok. Defense-in-depth
 * olarak burada whitelist regex'i dayatıyoruz; idSchema bir gün regex
 * eklerse bu redundant olur ama zararsız (idempotent).
 */
const SAFE_KEY_SEGMENT = /^[A-Za-z0-9._-]{1,64}$/;

function assertSafeKeySegment(label: string, value: string): void {
  if (!SAFE_KEY_SEGMENT.test(value)) {
    throw new Error(
      `report-cache: unsafe key segment '${label}' (value contains characters outside [A-Za-z0-9_-] or length out of 1-64)`,
    );
  }
}

/**
 * §16.7 key formatı:
 *   `report:dataset:v1:{scopeKind}:{scopeId}:{presetId}:{hash}[:admin]`
 *
 * Permission filtreleme cache key'inde: `userId` hash'in girdisindedir
 * (her kullanıcının gördüğü dataset farklı olabilir). Workspace admin
 * için `userId` hash'ten çıkarılır + `:admin` suffix → tüm admin'ler
 * aynı cache row'unu paylaşır.
 *
 * Bilgi sızıntısı engeli (§9.4): `userId` hash'te → restricted-scope
 * filtreleme uygulanmış dataset'ler asla başka user'a servis edilmez.
 */
export function buildReportCacheKey(args: {
  scope: ReportScope;
  presetId: string;
  filters: ReportFilters;
  comparison: ComparisonConfig | null;
  userId: string;
  /** Workspace owner/admin için ortak key. */
  isAdmin?: boolean;
}): string {
  const scopeId = scopeIdFor(args.scope);
  // Defense-in-depth (HIGH-1): user-supplied segment'leri Redis-safe karakter
  // setine kısıtla. Concat üzerinden `:`/`*` injection olamasın.
  assertSafeKeySegment('scopeId', scopeId);
  assertSafeKeySegment('presetId', args.presetId);
  const suffix = args.isAdmin ? ':admin' : '';
  const hash = stableHash({
    filters: args.filters,
    comparison: args.comparison,
    userId: args.isAdmin ? undefined : args.userId,
  });
  return `${KEY_PREFIX}:${KEY_VERSION}:${args.scope.kind}:${scopeId}:${args.presetId}:${hash}${suffix}`;
}

/**
 * Bir scope-id ailesi için invalidation pattern — SCAN MATCH ile
 * tüketilir. `{presetId}:{hash}` parçaları wildcard.
 */
export function reportInvalidationPattern(args: {
  scopeKind: ReportScopeKind;
  scopeId: string;
}): string {
  // HIGH-1 defense-in-depth: outbox event payload'undan gelen scopeId de
  // whitelist'ten geçer (`realtime_events.payload.data.{listId,cardId,...}`
  // worker'da extract edilirken kötü payload pattern'a sızmasın).
  assertSafeKeySegment('scopeId', args.scopeId);
  return `${KEY_PREFIX}:${KEY_VERSION}:${args.scopeKind}:${args.scopeId}:*`;
}

function scopeIdFor(scope: ReportScope): string {
  switch (scope.kind) {
    case 'card':
      return scope.cardId;
    case 'list':
      return scope.listId;
    case 'board':
      return scope.boardId;
    case 'workspace':
      return scope.workspaceId;
  }
}

/**
 * Stable JSON serialization (anahtar sırası deterministik) → SHA-1 ilk
 * 16 hex (key uzunluğunu makul tutarken collision riskini FNV-1a 32-bit
 * yerine kabul edilebilir seviyeye indirir — security review L1, 13D
 * deferred). Kriptografik güvence aramayız; sadece collision direnci.
 */
function stableHash(value: unknown): string {
  const json = stableStringify(value);
  return createHash('sha1').update(json).digest('hex').slice(0, 16);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

// ─── NoOp implementation ────────────────────────────────────────────────────

/**
 * Test/dev fallback — Redis yoksa cache devreye girmez ama
 * `report.preview` çalışır (her sefer fresh query).
 */
export class NoOpReportCache implements ReportCache {
  async get<T = unknown>(_key: string): Promise<T | null> {
    return null;
  }
  async set<T = unknown>(_key: string, _value: T, _ttlSeconds: number): Promise<void> {
    // no-op
  }
  async invalidatePattern(_pattern: string): Promise<number> {
    return 0;
  }
}

/** Singleton NoOp — host wire'lanmamışsa varsayılan. */
export const noOpReportCache: ReportCache = new NoOpReportCache();

// ─── Redis implementation ──────────────────────────────────────────────────

/**
 * Pusula Redis pattern: SCAN + DEL batch — `KEYS` production'da blocking,
 * yasak. SCAN cursor non-blocking; COUNT=100 batch.
 *
 * `apps/api` host'unda ioredis singleton oluşur (Faz 5 realtime + Faz 6
 * notification queue ile ortak); aynı connection 13E cache için
 * `reportCache`'i inject eder.
 */
export function buildRedisReportCache(redis: RedisCacheClient): ReportCache {
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const raw = await redis.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // Bozuk JSON (kötü write) — silip null dön (self-heal).
        await redis.del(key);
        return null;
      }
    },

    async set<T = unknown>(key: string, value: T, ttlSeconds: number): Promise<void> {
      // EX = expiry in seconds. NX/XX yok — overwrite kabul (fresh data
      // her zaman önemli).
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    },

    async invalidatePattern(pattern: string): Promise<number> {
      let cursor = '0';
      let deleted = 0;
      do {
        const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = reply[0];
        const keys = reply[1];
        if (keys.length > 0) {
          deleted += await redis.del(...keys);
        }
      } while (cursor !== '0');
      return deleted;
    },
  };
}

/**
 * Faz 13C — `ScopeAdapter<TData>` arayüzü + `QueryCtx` + `resolveRange`
 * + `runScopeAdapter` dispatcher (DEM-259). Saf TypeScript — gerçek
 * Drizzle query implementasyonları 13D'de
 * `packages/api/src/services/report-data/*` altında.
 *
 * Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.5 +
 * `docs/domain/09-raporlama-kurallari.md` §9.3-9.4.
 */
import type { BoardRole, WorkspaceRole } from '../constants';
import type {
  BoardScope,
  CardScope,
  ListScope,
  RangePreset,
  ReportFilters,
  ReportRange,
  ReportScope,
  WorkspaceScope,
} from './types';

/**
 * Permission helper'ları için ufak adapter — 13D'de `@pusula/api` somut
 * implementasyon (Drizzle + session ctx) verir. Domain SADECE arayüzü
 * bilir; iş mantığı bağımsız test edilebilir (mock).
 *
 * "Accessible" listesi her zaman session user perspektifinden filtre
 * edilmiş id'leri döner — restricted scope rozeti (§9.4) bu listeyi
 * toplam ile karşılaştırır.
 */
export interface PermissionsCtx {
  /** Workspace içinde session user'ın görebildiği board id'leri. */
  accessibleBoardsInWorkspace(workspaceId: string): Promise<readonly string[]>;
  /** Board içinde session user'ın görebildiği list id'leri. */
  accessibleListsInBoard(boardId: string): Promise<readonly string[]>;
  /** Direkt rol kontrolü (≥ minimum). */
  hasBoardAccess(boardId: string, minRole: BoardRole): Promise<boolean>;
  hasWorkspaceAccess(workspaceId: string, minRole: WorkspaceRole): Promise<boolean>;
}

/**
 * Query bağlamı. Domain'de yalnız TİP olarak yaşar; `db` runtime'da
 * Drizzle instance (`@pusula/db` `Database`); ama domain bunu `unknown`
 * olarak görür çünkü Drizzle import edemez.
 *
 * `now` test edilebilirlik için injection — `resolveRange` ve aging
 * hesapları deterministik test'lerde sabit zaman kullanabilir.
 */
export interface QueryCtx {
  /**
   * Drizzle `Database` instance. Domain tarafında `unknown`; 13D
   * `@pusula/api` kendi yerel `QueryCtx`'inde `db: Database` ile
   * daraltır (intersection type).
   */
  db: unknown;
  permissions: PermissionsCtx;
  /** Session user id (nanoid). */
  userId: string;
  /** Test edilebilirlik için clock injection. */
  now: () => Date;
}

/**
 * Bir micro-report'un veri-getirme sözleşmesi. Her seviye opsiyonel —
 * manifest'in `supports` alanı hangi seviyelerin implement edildiğini
 * belirtir (§9.2). Dispatch `runScopeAdapter` ile yapılır.
 */
export interface ScopeAdapter<TData> {
  card?(ctx: QueryCtx, scope: CardScope, filters: ReportFilters): Promise<TData>;
  list?(ctx: QueryCtx, scope: ListScope, filters: ReportFilters): Promise<TData>;
  board?(ctx: QueryCtx, scope: BoardScope, filters: ReportFilters): Promise<TData>;
  workspace?(
    ctx: QueryCtx,
    scope: WorkspaceScope,
    filters: ReportFilters,
  ): Promise<TData>;
}

/**
 * `ScopeAdapter<TData>` + `ReportScope` verince doğru handler'ı çağır.
 * Adapter o scope'u `supports` etmiyorsa (handler yoksa) `Error` fırlatır
 * — registry-preset cross-validation bunu sıfıra indirmek için tasarlandı
 * (preset bir micro-report'u listelerken o seviyede `supports` olduğunu
 * doğrular, bkz. presets.ts cross-validation testi).
 */
export async function runScopeAdapter<TData>(
  adapter: ScopeAdapter<TData>,
  ctx: QueryCtx,
  scope: ReportScope,
  filters: ReportFilters,
): Promise<TData> {
  switch (scope.kind) {
    case 'card': {
      if (!adapter.card) {
        throw new Error(
          `scope-adapter: micro-report does not support 'card' scope (handler missing)`,
        );
      }
      return adapter.card(ctx, scope, filters);
    }
    case 'list': {
      if (!adapter.list) {
        throw new Error(
          `scope-adapter: micro-report does not support 'list' scope (handler missing)`,
        );
      }
      return adapter.list(ctx, scope, filters);
    }
    case 'board': {
      if (!adapter.board) {
        throw new Error(
          `scope-adapter: micro-report does not support 'board' scope (handler missing)`,
        );
      }
      return adapter.board(ctx, scope, filters);
    }
    case 'workspace': {
      if (!adapter.workspace) {
        throw new Error(
          `scope-adapter: micro-report does not support 'workspace' scope (handler missing)`,
        );
      }
      return adapter.workspace(ctx, scope, filters);
    }
  }
}

// ─── Date range resolution ─────────────────────────────────────────────────

/**
 * `ReportFilters['range']` → mutlak `[from, to]` aralığı. Inclusive `to`
 * (Drizzle `between` ile uyumlu — yarı-açık `[from, to)` istenirse caller
 * `to`'ya 1ms ekler).
 *
 * **DİKKAT — saat dilimi:** preset hesaplaması **HOST-LOCAL timezone**
 * (`Date.getFullYear/Month/Date`) üzerinde çalışır; "session user'ın
 * takvimi" varsayılır. Worker context'inde host TZ = container TZ (genelde
 * UTC); session'da request handler TZ farklı olabilir. **13D query
 * servisi workspace timezone'a göre shift etmek ZORUNDA** — bu fonksiyon
 * timezone-aware DEĞIL, "naive" calendar arithmetic döner. Domain saf TS
 * + framework-bağımsız kalsın diye Intl/timezone runtime sızıntısı yok.
 *
 * @param range Preset veya custom range filter.
 * @param now Test edilebilirlik için clock; çağırırken `ctx.now()` geçilir.
 */
export function resolveRange(range: ReportRange, now: Date): { from: Date; to: Date } {
  if (range.kind === 'custom') {
    return { from: new Date(range.from), to: new Date(range.to) };
  }
  return resolveRangePreset(range.preset, now);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);
}

function quarterStart(d: Date): Date {
  const month = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), month, 1, 0, 0, 0, 0);
}

export function resolveRangePreset(
  preset: RangePreset,
  now: Date,
): { from: Date; to: Date } {
  const today = startOfDay(now);
  const toEndOfNow = endOfDay(now);

  switch (preset) {
    case 'today':
      return { from: today, to: toEndOfNow };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: endOfDay(yesterday) };
    }
    case 'last7d':
      return { from: addDays(today, -6), to: toEndOfNow };
    case 'last30d':
      return { from: addDays(today, -29), to: toEndOfNow };
    case 'last90d':
      return { from: addDays(today, -89), to: toEndOfNow };
    case 'thisMonth':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
        to: toEndOfNow,
      };
    case 'lastMonth': {
      const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      // Day 0 of "this month" = ayın son günü ("önceki ayın 30/31'i").
      const lastDayOfLast = new Date(now.getFullYear(), now.getMonth(), 0);
      // Diğer preset'lerle simetri: `to` = endOfDay (`.999ms`).
      return { from: firstOfLast, to: endOfDay(lastDayOfLast) };
    }
    case 'thisQuarter':
      return { from: quarterStart(now), to: toEndOfNow };
    case 'thisYear':
      return {
        from: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0),
        to: toEndOfNow,
      };
  }
}

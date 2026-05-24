/**
 * Faz 13O (DEM-271) — `restrictedScope` envelope alanını hesaplar.
 *
 * Auto-aggregation kuralı (`docs/domain/09-raporlama-kurallari.md` §9.4):
 *  - Kullanıcı bir üst-scope raporu istediğinde, kendisinin erişemediği alt
 *    entity'ler rapora dahil edilmez.
 *  - Envelope'a `{ excludedKind, excludedCount }` rozeti gelir; UI/PDF
 *    `<RestrictedScopeBanner>` ile "X panosu görünürlüğünüz dışında" gösterir.
 *  - Dışlanan entity'lerin isim/id'leri envelope'a girmez — "bilgi sızıntısı
 *    yok" garantisi (sadece sayı + kind).
 *  - Workspace admin için restricted hesabı null döner (her şeyi görür).
 *
 * V1 sınırı (kanonik §9.4): Pusula'da list-level granular permission yok;
 * board scope için `restrictedScope` her zaman null. List/Card scope'ta alt
 * entity olmadığı için null. Sadece workspace scope'ta member/guest için
 * anlamlı çıktı verir.
 */
import type {
  QueryCtx,
  ReportScope,
  RestrictedScope,
} from '@pusula/domain/reports';

export async function computeRestrictedScope(args: {
  ctx: QueryCtx;
  scope: ReportScope;
}): Promise<RestrictedScope | null> {
  const { ctx, scope } = args;

  if (scope.kind === 'workspace') {
    // Workspace admin (owner/admin) tüm board'ları görür → restricted yok.
    // `hasWorkspaceAccess` PermissionsCtx'in ortak helper'ı; tek bir DB
    // çağrısı + cache (workspaceRoleByWorkspace) yeterli.
    const isAdmin = await ctx.permissions.hasWorkspaceAccess(scope.workspaceId, 'admin');
    if (isAdmin) return null;

    const accessible = await ctx.permissions.accessibleBoardsInWorkspace(scope.workspaceId);
    const total = await ctx.permissions.totalBoardsInWorkspace(scope.workspaceId);
    const excludedCount = total - accessible.length;
    // 0 (member tüm board'lara üye) veya 0 board'lu workspace'te rozet
    // göstermenin anlamı yok — null döner, UI banner'ı render etmez.
    if (excludedCount <= 0) return null;
    return { excludedKind: 'board', excludedCount };
  }

  if (scope.kind === 'board') {
    // V1: list-level ACL yok → restricted hesaplanmaz. V2'de list-level
    // permission gelirse şu pattern:
    //   const accessible = await ctx.permissions.accessibleListsInBoard(scope.boardId);
    //   const total = await ctx.permissions.totalListsInBoard(scope.boardId);
    //   const excludedCount = total - accessible.length;
    //   return excludedCount > 0 ? { excludedKind: 'list', excludedCount } : null;
    return null;
  }

  // List / Card scope: alt entity yok, restricted da yok.
  return null;
}

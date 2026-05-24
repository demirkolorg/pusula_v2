/**
 * Audit log action enum — yalnız kritik mutation kapsamı.
 *
 * activity_events ile dublike DEĞİL: activity geniş kapsamlı + reversible,
 * audit forensic odaklı. Bir mutationın audit'e girme kriteri:
 *   1. Geri alınamaz veya zor geri alınır (delete, role değişikliği, token üretimi).
 *   2. Forensic ihtiyaç olabilir ("kim ne zaman bu kaydı sildi / yetkisini değiştirdi?").
 *
 * `board.delete` ve `card.delete` enum'da yer alır ama bugün caller'ı YOKTUR
 * (codebase'de hard delete mutation'ı yok — yalnız `archive` var ve archive
 * reversible olduğu için kriter 1'i sağlamıyor). Forward-compat: hard delete
 * mutation'ı eklendiğinde appendAudit çağrısı doğrudan bağlanır. Karar:
 * 2026-05-24, `docs/architecture/17-audit-log-mimarisi.md` + DEM-282.
 *
 * Append-only enum: yeni action eklenir, mevcutlar değiştirilmez/silinmez
 * (DB'de string olarak saklanır; eski kayıtlar enum'dan düşmüş bir action
 * taşıyabilir, UI tarafında "unknown" olarak gösterilir).
 */
export const AUDIT_ACTIONS = [
  // Workspace lifecycle
  'workspace.delete',
  'workspace.member.role_change',
  'workspace.member.remove',
  'workspace.invitation.revoke',
  // Board lifecycle (board.delete forward-compat — bugün hard delete yok)
  'board.delete',
  'board.member.role_change',
  'board.member.remove',
  'board.invitation.revoke',
  // Card destructive (card.delete forward-compat — bugün hard delete yok)
  'card.delete',
  'attachment.delete',
  // Share (forensic kritik — token üretimi + iptali)
  'share.create',
  'share.revoke',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Audit log hedef entity türü. `targetId` her zaman bu türde bir nanoid.
 * `user` → bir workspace_members satırının `userId`'si veya
 * workspace_invitations.acceptedById gibi user FK'ları.
 */
export const AUDIT_TARGET_TYPES = [
  'workspace',
  'board',
  'list',
  'card',
  'user',
  'attachment',
  'share_link',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

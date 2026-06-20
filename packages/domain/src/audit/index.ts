/**
 * @pusula/domain/audit — Faz 8E (DEM-282) audit log domain paketi.
 *
 * Saf TypeScript: Drizzle, tRPC, framework bağımlılığı YOK.
 *
 *  - `AUDIT_ACTIONS`      — kritik mutation enum (forensic kapsam, append-only)
 *  - `AUDIT_TARGET_TYPES` — hedef entity türü enum
 *  - `auditLogEntrySchema` — Zod şeması (API çıkış doğrulaması için)
 *  - `truncateForAudit`    — activity before/after metin alanı kırpma (≤2KB)
 *
 * Detay: `docs/architecture/17-audit-log-mimarisi.md` +
 * `docs/architecture/06-bildirim-altyapisi.md` "Bildirim detay / audit ekranı".
 */
export {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type AuditAction,
  type AuditTargetType,
} from './actions';
export { auditLogEntrySchema, type AuditLogEntry } from './schemas';
export {
  AUDIT_TEXT_MAX,
  truncateForAudit,
  type TruncatedAuditText,
} from './truncate';

import { desc } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { workspaces } from './workspaces';
import { primaryId } from './_common';

/**
 * Faz 8E (DEM-282) — kritik mutationların kalıcı/immutable izi.
 *
 * `activity_events` ile farkı: activity geniş kapsamlı + reversible
 * (cascade silinebilir) + UX akışı; audit yalnız kritik destructive op
 * + permission değişimi + share token üretimi/iptali, **append-only**
 * (UPDATE/DELETE trigger reddi — migration 0041 içinde tanımlı), süresiz
 * retention, yalnız workspace owner görüntüler.
 *
 * `workspace_id` ON DELETE CASCADE — workspace silindiğinde audit kayıtları
 * da temizlenir. 8.0 RESTRICT kararı pratikte uygulanamadı (workspace.delete
 * same-tx self-FK ihlali + mevcut test teardown'ları); kullanıcı CASCADE
 * seçti (2026-05-24). Forensic etki: workspace yaşadığı sürece audit
 * korunur; silme sonrası kayıt gider (workspace owner artık olmadığı için
 * okuyucusu da kalmaz). Detay: `docs/architecture/17-audit-log-mimarisi.md`
 * §2.1 + `02-teknoloji-kararlari.md` Karar kaydı 2026-05-24.
 *
 * `actor_id` ON DELETE SET NULL — kullanıcı silinince actor anonimleşir,
 * forensic kayıt korunur (GDPR right-to-erasure ↔ compliance dengesi:
 * actor PII'sı düşer, audit hattı kalır).
 *
 * Detay: `docs/architecture/17-audit-log-mimarisi.md`.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    workspaceId: text()
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorId: text().references(() => users.id, { onDelete: 'set null' }),
    /** AUDIT_ACTIONS literal (12 değer — `@pusula/domain` `AuditAction`). */
    action: text().notNull(),
    /** AUDIT_TARGET_TYPES literal (`@pusula/domain` `AuditTargetType`). */
    targetType: text().notNull(),
    targetId: text().notNull(),
    /** Mutation öncesi delta (action'a göre şekil değişir, UI tarafında render edilir). */
    before: jsonb(),
    /** Mutation sonrası delta. Hard delete'te `null`. */
    after: jsonb(),
    ip: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_workspace_idx').on(t.workspaceId, desc(t.createdAt)),
    index('audit_log_target_idx').on(t.targetType, t.targetId),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

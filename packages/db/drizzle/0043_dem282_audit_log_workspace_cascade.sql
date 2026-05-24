-- DEM-282 (Faz 8E) follow-up — `audit_log.workspace_id` FK = ON DELETE CASCADE.
-- 8.0 önce-belgesindeki ON DELETE RESTRICT kararı pratikte uygulanamadı:
--   1. workspace.delete: same-tx audit insert + workspace delete self-referential
--      FK ihlali (audit ↔ workspaces).
--   2. Mevcut 7 integration test teardown'u workspace silmek istiyor; audit
--      satırı varsa RESTRICT reddiyle teardown patlıyor.
--   3. "Manuel audit cleanup UI" 8E scope dışı + Faz 8 sonrası bile planlı değil.
-- Karar (2026-05-24 kullanıcı seçimi): CASCADE — workspace silindiğinde audit
-- kayıtları da DELETE'lenir. Forensic etki: workspace silinene kadar audit
-- hattı korunur; silme sonrası kayıt kaybolur (workspace owner artık olmadığı
-- için okuyucusu da kalmaz). Doc senkronu: `17-audit-log-mimarisi.md` +
-- `02-teknoloji-kararlari.md` "Karar kaydı" 2026-05-24 satırı + 8.0 ADR
-- maddesi (4) revize edildi (RESTRICT → CASCADE).
--
-- workspace.delete artık `appendAudit` çağırabilir (FK CASCADE same-tx insert
-- + delete'i kabul eder — silme ON DELETE CASCADE ile audit'i de aynı tx'te
-- temizler).
ALTER TABLE "audit_log"
  DROP CONSTRAINT "audit_log_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_workspace_id_workspaces_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id")
  ON DELETE CASCADE ON UPDATE no action;

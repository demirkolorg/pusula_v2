-- Faz 13P (DEM-272) — rapor retention worker performans index'leri.
-- DB review 2026-05-24 bulgusu: daily retention tick'in iki ana sorgusu
-- (saved-attached + ad-hoc adayları) ve cascade asset silimi mevcut
-- `(workspaceId, createdAt)` + `(savedReportId, version)` index'lerinden
-- yararlanamıyor; milyonlarca satırlık production'da seq scan riski.
--
-- 1. `report_renders_retention_saved_idx` — partial index:
--    `WHERE saved_report_id IS NOT NULL`, `(saved_report_id, created_at)`
--    ile retention worker `GROUP BY saved_report_id` adımını destekler.
-- 2. `report_renders_retention_adhoc_idx` — partial index:
--    `WHERE saved_report_id IS NULL`, `(created_at)` ile ad-hoc render
--    yaş filtresini destekler (workspace-agnostic).
-- 3. `report_render_assets_render_idx` — render_id b-tree:
--    Postgres FK referansını otomatik index'lemez; asset fetch + ON
--    DELETE CASCADE bu index olmadan seq scan riski.
--
-- Spec: `docs/architecture/16-raporlama-mimarisi.md` §16.17.

CREATE INDEX IF NOT EXISTS "report_renders_retention_saved_idx"
  ON "report_renders" ("saved_report_id", "created_at")
  WHERE "saved_report_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_renders_retention_adhoc_idx"
  ON "report_renders" ("created_at")
  WHERE "saved_report_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_render_assets_render_idx"
  ON "report_render_assets" ("render_id");

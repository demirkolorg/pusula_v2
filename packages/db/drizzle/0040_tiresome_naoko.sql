-- DEM-275 (Faz 13S) — `notification_type` enum `'report_scheduled_ready'` ekleme
-- migration `0039_dem275_faz13S_report_scheduled_ready.sql` ile yapıldı
-- (`IF NOT EXISTS`'li, idempotent). drizzle-kit `pnpm db:generate` snapshot
-- diff'inde aynı satırı bir kez daha üretmiş; üretim sırasında çift ekleme
-- `IF NOT EXISTS`'siz olduğu için fresh DB'de SQLSTATE 42710 ile patlardı —
-- bu yüzden bu dosyadan kaldırıldı. Yalnız Faz 13P retention index'leri
-- (snapshot'a aitti, eski `0038_dem272_faz13P_retention_indexes.sql` SQL
-- dosyasında yer almıyordu) bu migration'da kalır.
CREATE INDEX "report_render_assets_render_idx" ON "report_render_assets" USING btree ("render_id");--> statement-breakpoint
CREATE INDEX "report_renders_retention_saved_idx" ON "report_renders" USING btree ("saved_report_id","created_at") WHERE "report_renders"."saved_report_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "report_renders_retention_adhoc_idx" ON "report_renders" USING btree ("created_at") WHERE "report_renders"."saved_report_id" IS NULL;
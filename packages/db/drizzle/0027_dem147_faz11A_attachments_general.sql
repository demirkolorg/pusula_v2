-- Faz 11A (DEM-147) — `attachments` tablosu DEM-110 kart-kapak-resmi yolundan
-- genel kart eki yoluna genişler. İki yeni kolon + iki partial index + mevcut
-- (DEM-110) satırlar için geriye-dönük backfill.
--
-- Kolonlar:
--   * `description text NULL`             — opsiyonel açıklama (≤500 char, plain text)
--   * `committed_at timestamptz NULL`     — two-phase commit damgası
--                                            (`NULL` = draft, NOW() = commit edilmiş)
--
-- Backfill: DEM-110 single-shot path zaten "commit edilmiş" semantiğindeydi
-- (`createUpload` doğrudan satırı ekliyordu). Geriye-dönük olarak tüm mevcut
-- satırların `committed_at`'i `created_at`'e set edilir; böylece `commit IS NOT
-- NULL` filtreli `attachment.list` query'leri hiçbir mevcut kart-kapak-resmini
-- kaybetmez. Yeni Faz 11 `initiate → PUT → commit` akışı bu kolonu draft
-- damgalamak için kullanır.
--
-- Index stratejisi (`docs/architecture/04-veri-katmani.md` "Faz 11 kapsamı"):
--   * `attachments_card_committed_idx`  → kart ek listesi sorgusu (yalnız commit'li
--                                          satırlar, `committed_at DESC`).
--   * `attachments_orphan_sweep_idx`    → `pusula-attachment-cleanup` worker'ının
--                                          orphan tarayıcısı (draft satırlar +
--                                          1 saatlik yaş).
ALTER TABLE "attachments" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "committed_at" timestamp with time zone;--> statement-breakpoint
UPDATE "attachments" SET "committed_at" = "created_at" WHERE "committed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "attachments_card_committed_idx" ON "attachments" USING btree ("card_id","committed_at" DESC NULLS LAST) WHERE "attachments"."committed_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "attachments_orphan_sweep_idx" ON "attachments" USING btree ("committed_at") WHERE "attachments"."committed_at" IS NULL;

-- DEM-153 — `notification_type` Postgres enum'una 10 yeni granular değer:
--
--   'card_renamed'             — kart başlığı değişti (`card.renamed`)
--   'card_description_changed' — kart açıklaması değişti (`card.description_changed`)
--   'card_label_added'         — kart etiketi eklendi (`card.label_added`)
--   'card_label_removed'       — kart etiketi kaldırıldı (`card.label_removed`)
--   'comment_updated'          — yorum düzenlendi (`comment.updated`)
--   'comment_deleted'          — yorum silindi (`comment.deleted`)
--   'checklist_created'        — yapılacaklar listesi eklendi (`checklist.created`)
--   'checklist_item_added'     — yapılacaklar maddesi eklendi (`checklist.item_added`)
--   'checklist_item_removed'   — yapılacaklar maddesi silindi (`checklist.item_removed`)
--   'attachment_removed'       — karttan dosya kaldırıldı (`attachment.removed`)
--
-- DEM-152 sonrası bile kartla ilgili birçok aksiyon hiç bildirim üretmiyordu.
-- DEM-153 bu boşluğu kapatır: kartla ilgili tüm aksiyonlar bildirim üretir,
-- kullanıcı her birini bildirim ayarlarından tek tek kapatabilir. 10 yeni tip
-- de yalnız in-app; alıcı kart watcher pool; 60 sn cooldown. `checklist.item_unchecked`
-- yeni tip açmaz — mevcut `checklist_item_completed` tipine bağlanır.
--
-- Kaynak: `@pusula/domain/constants.ts` `NOTIFICATION_TYPES` listesi
-- (`pgEnum('notification_type', NOTIFICATION_TYPES)` ile bağlanıyor — DB enum
-- tek listeye eşitlenmek zorunda; aksi halde rule engine fan-out ettiğinde
-- insert SQLSTATE 22P02 ile fail eder).
--
-- `IF NOT EXISTS` idempotent (önceki member_* / granular pattern: 0022, 0028).
--
-- Detay → `docs/domain/04-bildirim-kurallari.md` "DEM-153 — kart aksiyonlarının
-- tamamı bildirim üretir".
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_renamed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_description_changed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_label_added';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_label_removed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'comment_updated';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'comment_deleted';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'checklist_created';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'checklist_item_added';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'checklist_item_removed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'attachment_removed';

-- DEM-152 — `notification_type` Postgres enum'una 7 yeni granular değer:
--
--   'card_moved'          — kart taşındı (`card.moved`)
--   'card_archived'       — kart arşivlendi (`card.archived`)
--   'card_completed'      — kart tamamlandı/geri alındı (`card.completed` / `card.uncompleted`)
--   'card_due_changed'    — teslim tarihi değişti/kaldırıldı (`card.due_set` / `card.due_cleared`)
--   'card_cover_changed'  — kapak rengi/fotoğrafı değişti (`card.cover_*`)
--   'card_member_removed' — karttan çıkarıldın (`card.member_removed`)
--   'attachment_added'    — karta dosya eklendi (`attachment.added`)
--
-- `watched_activity` "çöp kovası" tipi bu 7 granular tipe bölündü (saf
-- ayrıştırma — yeni tetikleyici/kanal yok). `watched_activity` enum değeri
-- SİLİNMEZ (Postgres enum append-only); artık hiçbir olay ona yönlenmez,
-- yalnız geriye dönük/fallback değer olarak kalır.
--
-- Kaynak: `@pusula/domain/constants.ts` `NOTIFICATION_TYPES` listesi
-- (`pgEnum('notification_type', NOTIFICATION_TYPES)` ile bağlanıyor — DB
-- enum tek listeye eşitlenmek zorunda; aksi halde rule engine fan-out
-- ettiğinde insert SQLSTATE 22P02 ile fail eder).
--
-- `IF NOT EXISTS` idempotent — pre-existing dev DB'lerinde de tek atışta
-- güvenli (önceki member_* migration pattern'i: 0022).
--
-- Detay → `docs/domain/04-bildirim-kurallari.md` "Bildirim tipi taksonomisi"
-- + `docs/architecture/06-bildirim-altyapisi.md` "Notification processor".
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_moved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_archived';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_completed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_due_changed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_cover_changed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_member_removed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'attachment_added';

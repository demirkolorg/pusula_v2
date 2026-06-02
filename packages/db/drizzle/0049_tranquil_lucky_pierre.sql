-- Bildirim kapsamı genişletme — Faz 2 (granular tipler, 2026-06-03).
--
-- Faz 1 (pool genişletme, 25abfc9) kart aktivitesi bildirimlerini board
-- audience'a taşıdı. Faz 2 yeni granular bildirim TİPLERİ ekler: kart oluşturma,
-- liste yaşam döngüsü (oluştur/yeniden adlandır/taşı/arşivle/sil), board yaşam
-- döngüsü (oluştur/yeniden adlandır/arşivle/arka plan) ve etiket CRUD'u
-- (oluştur/güncelle/sil). Kullanıcı kararı "granular: her olay ayrı tip".
--
-- İki enum genişletmesi:
--  1. `activity_event_type` — etiket CRUD'u Phase 2.5B'den beri hiç activity
--     yazmıyordu; `label.created/updated/deleted` eklenir. `card.created`,
--     `list.*`, `board.*` zaten vardı (eklenmez).
--  2. `notification_type` — 13 yeni granular bildirim tipi.
--
-- Postgres enum append-only protokolü: `ALTER TYPE ... ADD VALUE IF NOT EXISTS`
-- (idempotent — aynı pattern 0022 / 0028 / 0029 / 0030 / 0032 / 0045).
-- Domain kaynağı: `@pusula/domain/constants.ts` `ACTIVITY_EVENT_TYPES` +
-- `NOTIFICATION_TYPES`. Detay → `docs/domain/04-bildirim-kurallari.md`.
ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'label.created';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'label.updated';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'label.deleted';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'card_created';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'list_created';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'list_renamed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'list_moved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'list_archived';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'list_deleted';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'board_created';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'board_renamed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'board_archived';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'board_background_changed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'label_created';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'label_updated';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'label_deleted';

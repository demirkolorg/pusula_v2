-- Faz 17 (2026-06-01) — List/Card kalıcı silme.
--
-- `list.delete` / `card.delete` mutation'ları board admin+ yetkiyle çalışan
-- hard delete operasyonlarıdır. Activity geçmişi korunmalı; ama
-- `activity_events.card_id` / `list_id` ON DELETE CASCADE FK olduğundan
-- silinen kart/listenin id'si activity satırında null'a düşer — silinen
-- entity id'si `payload.cardId` / `payload.listId` içinde tutulur.
--
-- Bu migration `activity_event_type` enum'una iki yeni değer ekler. Postgres
-- enum append-only protokolü: ALTER TYPE ... ADD VALUE IF NOT EXISTS.
-- Domain kaynağı: `@pusula/domain/constants.ts` `ACTIVITY_EVENT_TYPES`.
--
-- Aynı pattern: 0022 / 0028 / 0029 / 0030 / 0032.
--
-- Detay → `docs/domain/02-yetkilendirme-kurallari.md` "Liste/kart kalıcı
-- silme" + `docs/architecture/02-teknoloji-kararlari.md` "Karar kaydı
-- 2026-06-01 (Faz 17 — Liste/kart kalıcı silme)".
ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'list.deleted';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE IF NOT EXISTS 'card.deleted';

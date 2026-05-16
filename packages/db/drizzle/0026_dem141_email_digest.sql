-- Faz 10G (DEM-141) — e-posta sıklığı (instant / hourly_digest / daily_digest /
-- off) + outbox `digest_queued` durumu.
--
-- Üç bölüm:
--
--   1. `notification_preferences.email_mode` kolonu (text + CHECK constraint).
--      `'instant'` mevcut davranışla aynı (her bildirim → ayrı transactional
--      mail). `'hourly_digest'` ve `'daily_digest'` 10G worker job'unu
--      tetikler. `'off'` ise email kanalı satırı outbox'a hiç insert edilmez
--      (legacy `email_enabled` flag'i geriye dönük korunur; rule engine
--      ikisini AND'ler — bkz. `notification-rules.ts:pickChannels`).
--
--      Mevcut satırlar `DEFAULT 'instant'` ile dolar; mute-bypass tipler
--      (mention, board_invitation, workspace_invitation) `email_mode`
--      değerinden bağımsız her zaman anlık gider (outbox helper'ında).
--
--   2. `outbox_status` enum'una `'digest_queued'` değeri. APPEND-ONLY disiplin
--      (Postgres enum'undan değer çıkarmak destructive); `IF NOT EXISTS`
--      idempotent — pre-existing dev DB'lerinde tek atışta güvenli. Satırı
--      `digest_queued` damgalanmış olan e-posta outbox kayıtları 6A publish
--      processor tarafından atlanır (`notification-publish.ts` digest worker
--      kanal kuyruğuna push etmez) ve 10G `notification-email-digest`
--      worker'ı tarafından toplu olarak işlenir.
--
--   3. Digest worker'ın `digest_queued` satırlarını recipient bazlı toplaması
--      için partial index — `pending` indexi `processed_at IS NULL` koşulunu
--      taşıdığı için outbox sweeper bu satırları yine yakalayabiliyor; digest
--      worker da hızlı SELECT için bu indexi kullanır.
--
-- Detay → `docs/architecture/06-bildirim-altyapisi.md` "Email digest (Faz
-- 10G)" + `docs/architecture/15-bildirim-ayar-ekrani.md` §15.4 Section 6.

ALTER TABLE "notification_preferences"
  ADD COLUMN "email_mode" text NOT NULL DEFAULT 'instant';--> statement-breakpoint

ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_email_mode_check"
  CHECK ("email_mode" IN ('instant', 'hourly_digest', 'daily_digest', 'off'));--> statement-breakpoint

ALTER TYPE "public"."outbox_status" ADD VALUE IF NOT EXISTS 'digest_queued';--> statement-breakpoint

-- NOTE (Faz 10F / DEM-140 koordinasyonu): Partial index `notification_outbox_
-- digest_queued_idx` BU migration'da oluşturulamıyor — `ALTER TYPE ADD VALUE
-- 'digest_queued'` aynı transaction içinde commit edilmemiş durumdayken
-- Postgres yeni değeri WHERE clause'unda kullanmayı reddediyor
-- (`unsafe_use_of_new_value` / `55P04`). `::text` cast IMMUTABLE değildir
-- (enum_out STABLE) — partial index predicate kabul etmiyor (`42P17`).
-- DEM-141'in bir sonraki turunda ayrı bir migration (örn.
-- `0027_dem141_email_digest_index.sql`) ile aşağıdaki ifadeyi yaratmalı:
--
--   CREATE INDEX IF NOT EXISTS "notification_outbox_digest_queued_idx"
--     ON "notification_outbox" ("recipient_id", "created_at")
--     WHERE "status" = 'digest_queued' AND "processed_at" IS NULL;
--
-- Schema referansı (`packages/db/src/schema/notifications.ts`) bu indexi
-- işaret etmeye devam eder; DB ile drift sadece digest worker indexini
-- içerir ve digest worker'ı (10G) tamamlanana kadar runtime'da etkisizdir.

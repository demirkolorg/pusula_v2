-- Faz 10H (DEM-142) — Snooze: kart bazında geçici sustur.
--
-- `notification_preferences.mute_until` kolonu kart-scope tercih satırında
-- kullanıcının "şu kartı X süre sustur" tercihini timestamp olarak saklar.
-- `NULL` → snooze yok; `NOT NULL AND > NOW()` → aktif snooze; `< NOW()` →
-- süresi dolmuş (audit için satır silinmez, rule engine görmezden gelir).
--
-- Rule engine (`packages/api/src/lib/notification-rules.ts:pickChannels`)
-- mute kontrolü genişler: `muteLevel = 'all'` VEYA (`mute_until > NOW()`)
-- → mute aktif (mute-bypass tipler hâlâ geçer: mention + *_invitation).
--
-- Partial index: yalnız `mute_until IS NOT NULL` satırları içerir; "aktif
-- snooze listesi" sorguları (`AccountTabs` Section 7) ve worker filter'ları
-- bu index üzerinden gider, tablo tarama yapmaz.
ALTER TABLE "notification_preferences"
  ADD COLUMN "mute_until" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX "notification_preferences_mute_until_idx"
  ON "notification_preferences" ("mute_until")
  WHERE "mute_until" IS NOT NULL;

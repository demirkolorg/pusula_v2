-- Faz 10A (DEM-135) — `notification_type` Postgres enum'una iki yeni değer:
--
--   'member_removed'      — board veya workspace üyeliği sona erdi (alıcı
--                           kaynağa artık erişemez; permission filter atlanır).
--   'member_role_changed' — board veya workspace rolü değişti.
--
-- Kaynak: `@pusula/domain/constants.ts` `NOTIFICATION_TYPES` listesi
-- (`pgEnum('notification_type', NOTIFICATION_TYPES)` ile bağlanıyor — DB
-- enum tek listeye eşitlenmek zorunda; aksi halde rule engine fan-out
-- ettiğinde insert SQLSTATE 22P02 ile fail eder).
--
-- `IF NOT EXISTS` idempotent — pre-existing dev DB'lerinde de tek atışta
-- güvenli (önceki member_* migration pattern'i: 0014/0015).
--
-- Detay → `docs/architecture/06-bildirim-altyapisi.md` "Faz 6 dispatch
-- açıkları (Faz 10A — DEM-135'te kapanır)" + `docs/domain/04-bildirim-kurallari.md`
-- "Bilinen açıklar (Faz 10A — DEM-135'te kapanır)".
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'member_removed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'member_role_changed';

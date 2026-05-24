-- DEM-282 (Faz 8E) follow-up — `audit_log_reject_mutation` trigger
-- fonksiyonu `actor_id` ON DELETE SET NULL FK cascade'ini bloklamamalı.
-- Sorun: PG bir kullanıcı silindiğinde `audit_log.actor_id` SET NULL için
-- internal UPDATE üretir; eski (0041) trigger bu UPDATE'i de "append-only"
-- reddiyle düşürür → user delete patlar.
--
-- Çözüm: trigger UPDATE'i yalnız "actor_id NOT NULL → NULL + diğer kolonlar
-- aynı" desenine izin verir (ON DELETE SET NULL imzası). Geriye kalan tüm
-- UPDATE / DELETE girişimleri reddedilir.
CREATE OR REPLACE FUNCTION "audit_log_reject_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.actor_id IS NOT NULL
       AND NEW.actor_id IS NULL
       AND OLD.id = NEW.id
       AND OLD.workspace_id IS NOT DISTINCT FROM NEW.workspace_id
       AND OLD.action IS NOT DISTINCT FROM NEW.action
       AND OLD.target_type IS NOT DISTINCT FROM NEW.target_type
       AND OLD.target_id IS NOT DISTINCT FROM NEW.target_id
       AND OLD.before IS NOT DISTINCT FROM NEW.before
       AND OLD.after IS NOT DISTINCT FROM NEW.after
       AND OLD.ip IS NOT DISTINCT FROM NEW.ip
       AND OLD.user_agent IS NOT DISTINCT FROM NEW.user_agent
       AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % operation rejected', TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;

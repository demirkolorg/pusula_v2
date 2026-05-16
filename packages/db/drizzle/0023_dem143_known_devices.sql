-- Faz 10I (DEM-143) — auth_known_devices table for "new device login" security email.
--
-- Each row records a (user_agent_hash, ip_subnet) pair we have seen for a
-- given user. The login-success hook (`apps/api/src/known-devices.ts`)
-- upserts into this table; the first time we see a (user, UA hash, subnet)
-- triplet we treat it as a new device and send the security email via
-- Resend (independent of `notification_outbox` — security mail is not a
-- user-controllable notification, see `docs/architecture/15-bildirim-ayar-ekrani.md`
-- §15.4 Section 8).
--
-- Indexing:
--   - `auth_known_devices_user_device_uq` lets the hook do an idempotent
--     `INSERT ... ON CONFLICT DO UPDATE SET last_seen_at = now()` to
--     simultaneously detect "known" (conflict path) vs "new" (insert path).
--   - `auth_known_devices_user_idx` covers `devices.list` (one user, sorted
--     by `last_seen_at DESC`) — that's the UI's only access pattern.
CREATE TABLE "auth_known_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"user_agent_hash" text NOT NULL,
	"ip_subnet" text NOT NULL,
	"user_agent" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_known_devices" ADD CONSTRAINT "auth_known_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_known_devices_user_device_uq" ON "auth_known_devices" USING btree ("user_id","user_agent_hash","ip_subnet");--> statement-breakpoint
CREATE INDEX "auth_known_devices_user_idx" ON "auth_known_devices" USING btree ("user_id","last_seen_at" DESC);

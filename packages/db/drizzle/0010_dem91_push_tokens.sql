-- Faz 6B (DEM-91) — finalised push_tokens schema for Expo push delivery.
--
-- Pre-Faz-6 the table was a Faz 0 stub (`active` boolean, nullable platform,
-- no uniqueness on token, no device_name, no revoked_at). The table has
-- never been populated (Faz 6B is the first wiring), so we drop & recreate
-- instead of ALTER-ing column-by-column — clearer diff, no data risk.
DROP INDEX "push_tokens_user_idx";--> statement-breakpoint
DROP INDEX "push_tokens_token_idx";--> statement-breakpoint
DROP TABLE "push_tokens";--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"device_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "push_tokens_platform_check" CHECK ("push_tokens"."platform" IN ('ios','android','web'))
);
--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_uq" ON "push_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_tokens_user_active_idx" ON "push_tokens" USING btree ("user_id") WHERE "push_tokens"."revoked_at" IS NULL;

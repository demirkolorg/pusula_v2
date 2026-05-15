-- Drift fix: schema'da `icon` kolonları zaten vardı (0018 entity_icons snapshot'ında
-- eksik kaldı; lokal geliştirici DB'lerinde `db:push` ile manuel uygulanmış olabilir).
-- Idempotent ALTER (IF NOT EXISTS) — hem temiz kurulumlarda hem mevcut DB'lerde güvenli.
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "icon" text DEFAULT 'briefcase' NOT NULL;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN IF NOT EXISTS "icon" text DEFAULT 'layout-grid' NOT NULL;
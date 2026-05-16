-- Faz 10F (DEM-140) — quiet hours columns on notification_preferences.
--
-- Adds `quiet_from`, `quiet_to`, `quiet_timezone` to support a single
-- "no push / no email" window per user. The semantics live on the global
-- preference row only (workspace/board/card scope rows ignore these
-- columns); a CHECK constraint enforces the all-or-nothing shape so the
-- worker filter never has to reason about partial states.
--
-- Behaviour (worker filter — `apps/worker/src/lib/quiet-hours.ts`):
--   - `quiet_from = quiet_to`  → empty window (no suppression).
--   - `quiet_from < quiet_to`  → same-day window [from, to).
--   - `quiet_from > quiet_to`  → overnight window [from, 24:00) ∪ [00:00, to).
--
-- Mute-bypass notification types (`mention`, `board_invitation`,
-- `workspace_invitation`) skip this filter — they reach the user even
-- inside the quiet window. The in-app channel is also unaffected.
--
-- See `docs/architecture/06-bildirim-altyapisi.md` "Quiet hours (sessiz
-- saatler, Faz 10F)" and `docs/architecture/15-bildirim-ayar-ekrani.md`
-- §15.4 Section 5.
ALTER TABLE "notification_preferences"
  ADD COLUMN "quiet_from" time,
  ADD COLUMN "quiet_to" time,
  ADD COLUMN "quiet_timezone" text;
--> statement-breakpoint
ALTER TABLE "notification_preferences"
  ADD CONSTRAINT "notification_preferences_quiet_hours_consistency"
  CHECK (
    ("quiet_from" IS NULL AND "quiet_to" IS NULL AND "quiet_timezone" IS NULL)
    OR
    ("quiet_from" IS NOT NULL AND "quiet_to" IS NOT NULL AND "quiet_timezone" IS NOT NULL)
  );

-- Faz 10B (DEM-136) — partial unique scope index on notification_preferences.
--
-- The `notifications.preferences.upsert` procedure relies on ON CONFLICT
-- (user_id, COALESCE(workspace_id,''), COALESCE(board_id,''), COALESCE(card_id,''))
-- DO UPDATE to keep (user, scope) pairs unique. The Faz 0 schema only had a
-- non-unique BTREE on (user_id); without this index a duplicate row could be
-- written for the same scope. The doc reference (`docs/architecture/06-bildirim-altyapisi.md`
-- "Notification preferences API") notes this gap explicitly.
--
-- COALESCE-on-nullable trick: Postgres UNIQUE treats NULLs as distinct, so a
-- multi-column unique over `(workspace_id, board_id, card_id)` would not
-- block two `(NULL, NULL, NULL)` global rows. Wrapping each scope column in
-- COALESCE(..., '') folds NULL into a sentinel that does compare equal. The
-- upsert path uses the same COALESCE expression list as conflict target.
CREATE UNIQUE INDEX "notification_preferences_scope_uq"
  ON "notification_preferences" (
    "user_id",
    COALESCE("workspace_id", ''),
    COALESCE("board_id", ''),
    COALESCE("card_id", '')
  );

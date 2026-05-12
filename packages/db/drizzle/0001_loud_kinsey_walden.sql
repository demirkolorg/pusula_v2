ALTER TYPE "public"."activity_event_type" ADD VALUE 'workspace.updated' BEFORE 'workspace.member_added';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'workspace.archived' BEFORE 'workspace.member_added';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'workspace.member_role_changed' BEFORE 'board.created';
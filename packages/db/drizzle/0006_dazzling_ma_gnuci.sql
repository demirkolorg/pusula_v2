ALTER TYPE "public"."activity_event_type" ADD VALUE 'board.member_role_changed';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'board.member_invited';--> statement-breakpoint
ALTER TYPE "public"."activity_event_type" ADD VALUE 'board.invitation_revoked';--> statement-breakpoint
CREATE TABLE "board_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"email" text NOT NULL,
	"role" "board_role" DEFAULT 'member' NOT NULL,
	"token" text NOT NULL,
	"invited_by_id" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_by_id" text,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_invitations" ADD CONSTRAINT "board_invitations_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_invitations" ADD CONSTRAINT "board_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_invitations" ADD CONSTRAINT "board_invitations_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_invitations_token_uq" ON "board_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "board_invitations_board_status_idx" ON "board_invitations" USING btree ("board_id","status");--> statement-breakpoint
CREATE INDEX "board_invitations_email_idx" ON "board_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "board_invitations_pending_email_uq" ON "board_invitations" USING btree ("board_id",lower("email")) WHERE "board_invitations"."status" = 'pending';
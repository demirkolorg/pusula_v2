CREATE TABLE "board_access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"requester_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"resolved_by_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_access_requests_status_check" CHECK ("board_access_requests"."status" IN ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "board_access_requests" ADD CONSTRAINT "board_access_requests_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_access_requests" ADD CONSTRAINT "board_access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_access_requests" ADD CONSTRAINT "board_access_requests_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "board_access_requests_board_status_idx" ON "board_access_requests" USING btree ("board_id","status");--> statement-breakpoint
CREATE INDEX "board_access_requests_requester_idx" ON "board_access_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE UNIQUE INDEX "board_access_requests_pending_uq" ON "board_access_requests" USING btree ("board_id","requester_id") WHERE "board_access_requests"."status" = 'pending';
CREATE TYPE "public"."report_render_format" AS ENUM('pdf', 'xlsx', 'png');--> statement-breakpoint
CREATE TYPE "public"."report_render_status" AS ENUM('queued', 'rendering', 'completed', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."report_schedule_cadence" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."report_scope_kind" AS ENUM('card', 'list', 'board', 'workspace');--> statement-breakpoint
CREATE TABLE "report_render_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"render_id" text NOT NULL,
	"format" "report_render_format" NOT NULL,
	"s3_bucket" text NOT NULL,
	"s3_key" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"checksum" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_renders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"saved_report_id" text,
	"schedule_id" text,
	"scope_kind" "report_scope_kind" NOT NULL,
	"scope_id" text NOT NULL,
	"preset_id" text NOT NULL,
	"filters" jsonb NOT NULL,
	"comparison" jsonb,
	"status" "report_render_status" DEFAULT 'queued' NOT NULL,
	"format" "report_render_format" NOT NULL,
	"restricted_scope" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"triggered_by" text,
	"trigger_kind" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_renders_trigger_kind_check" CHECK ("report_renders"."trigger_kind" IN ('manual', 'scheduled', 'save'))
);
--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"saved_report_id" text NOT NULL,
	"cadence" "report_schedule_cadence" NOT NULL,
	"cadence_config" jsonb NOT NULL,
	"timezone" text NOT NULL,
	"recipient_user_ids" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"recipient_emails" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"scope_kind" "report_scope_kind" NOT NULL,
	"scope_id" text NOT NULL,
	"preset_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"filters" jsonb NOT NULL,
	"micro_reports" jsonb NOT NULL,
	"comparison" jsonb,
	"created_by" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_render_assets" ADD CONSTRAINT "report_render_assets_render_id_report_renders_id_fk" FOREIGN KEY ("render_id") REFERENCES "public"."report_renders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_renders" ADD CONSTRAINT "report_renders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_renders" ADD CONSTRAINT "report_renders_saved_report_id_saved_reports_id_fk" FOREIGN KEY ("saved_report_id") REFERENCES "public"."saved_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_renders" ADD CONSTRAINT "report_renders_schedule_id_report_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."report_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_renders" ADD CONSTRAINT "report_renders_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_saved_report_id_saved_reports_id_fk" FOREIGN KEY ("saved_report_id") REFERENCES "public"."saved_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_renders_workspace_idx" ON "report_renders" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "report_renders_saved_idx" ON "report_renders" USING btree ("saved_report_id","version");--> statement-breakpoint
CREATE INDEX "report_schedules_next_run_idx" ON "report_schedules" USING btree ("next_run_at") WHERE "report_schedules"."is_active" = true;--> statement-breakpoint
CREATE INDEX "saved_reports_workspace_idx" ON "saved_reports" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "saved_reports_scope_idx" ON "saved_reports" USING btree ("scope_kind","scope_id");
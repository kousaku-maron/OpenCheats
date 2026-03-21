CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_type" text NOT NULL,
	"storage_url" text,
	"text_content" text,
	"mime_type" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"created_by_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"role" text DEFAULT 'reference' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"prompt_version_id" uuid NOT NULL,
	"task_type" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"resolved_prompt" text NOT NULL,
	"text_context" text DEFAULT '' NOT NULL,
	"settings_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error_message" text,
	"parent_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_created_by_run_id_runs_id_fk" FOREIGN KEY ("created_by_run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_inputs" ADD CONSTRAINT "run_inputs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_inputs" ADD CONSTRAINT "run_inputs_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_user_created_at_idx" ON "artifacts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "artifacts_run_created_at_idx" ON "artifacts" USING btree ("created_by_run_id","created_at");--> statement-breakpoint
CREATE INDEX "run_inputs_run_sort_idx" ON "run_inputs" USING btree ("run_id","sort_order");--> statement-breakpoint
CREATE INDEX "run_inputs_artifact_idx" ON "run_inputs" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "runs_user_created_at_idx" ON "runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_prompt_version_created_at_idx" ON "runs" USING btree ("prompt_version_id","created_at");
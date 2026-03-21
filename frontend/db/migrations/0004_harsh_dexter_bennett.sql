ALTER TABLE "artifacts" DROP COLUMN "storage_url";--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN "width";--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN "height";--> statement-breakpoint
ALTER TABLE "artifacts" DROP COLUMN "duration_ms";--> statement-breakpoint
ALTER TABLE "run_inputs" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "task_type";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "text_context";--> statement-breakpoint
ALTER TABLE "runs" DROP COLUMN "parent_run_id";
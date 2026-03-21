CREATE TABLE "user_provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_access_key" text NOT NULL,
	"encrypted_secret_key" text,
	"key_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_provider_credentials" ADD CONSTRAINT "user_provider_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_credentials_user_updated_at_idx" ON "user_provider_credentials" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_user_provider_idx" ON "user_provider_credentials" USING btree ("user_id","provider");
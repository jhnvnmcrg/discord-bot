CREATE TYPE "public"."schedule_result" AS ENUM('sent', 'missed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'scheduled';--> statement-breakpoint
CREATE TABLE "scheduled_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"channel_id" text NOT NULL,
	"schedule" jsonb NOT NULL,
	"timezone" text NOT NULL,
	"response_type" "response_type" DEFAULT 'text' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"embed" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_result" "schedule_result",
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_messages" ADD CONSTRAINT "scheduled_messages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_messages_guild_idx" ON "scheduled_messages" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "scheduled_messages_due_idx" ON "scheduled_messages" USING btree ("next_run_at");
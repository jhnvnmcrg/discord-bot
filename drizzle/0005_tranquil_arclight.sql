ALTER TYPE "public"."activity_type" ADD VALUE 'ai_reply';--> statement-breakpoint
CREATE TABLE "ai_chat_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"persona" text DEFAULT '' NOT NULL,
	"cooldown_seconds" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chat_settings" ADD CONSTRAINT "ai_chat_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;
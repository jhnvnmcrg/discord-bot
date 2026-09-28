CREATE TYPE "public"."activity_type" AS ENUM('command', 'autoresponse', 'member_join', 'member_leave', 'error');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('contains', 'exact', 'startsWith', 'regex');--> statement-breakpoint
CREATE TYPE "public"."response_type" AS ENUM('text', 'embed');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"guild_id" text,
	"type" "activity_type" NOT NULL,
	"name" text,
	"user_id" text,
	"channel_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auto_responders" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"trigger" text NOT NULL,
	"match_type" "match_type" DEFAULT 'contains' NOT NULL,
	"case_sensitive" boolean DEFAULT false NOT NULL,
	"response" text NOT NULL,
	"cooldown_seconds" integer DEFAULT 10 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_status" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"online" boolean DEFAULT false NOT NULL,
	"username" text,
	"avatar" text,
	"application_id" text,
	"ping" integer,
	"guild_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"last_heartbeat" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_commands" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"name" varchar(32) NOT NULL,
	"description" varchar(100) NOT NULL,
	"response_type" "response_type" DEFAULT 'text' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"embed" jsonb,
	"ephemeral" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welcome_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"channel_id" text,
	"message" text DEFAULT 'Welcome to {server}, {user}! You are member #{memberCount}.' NOT NULL,
	"auto_role_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auto_responders" ADD CONSTRAINT "auto_responders_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_commands" ADD CONSTRAINT "custom_commands_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welcome_settings" ADD CONSTRAINT "welcome_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_log_guild_created_idx" ON "activity_log" USING btree ("guild_id","created_at");--> statement-breakpoint
CREATE INDEX "auto_responders_guild_idx" ON "auto_responders" USING btree ("guild_id");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_commands_guild_name_idx" ON "custom_commands" USING btree ("guild_id","name");
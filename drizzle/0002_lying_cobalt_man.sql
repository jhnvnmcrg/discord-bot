CREATE TYPE "public"."reminder_delivery" AS ENUM('channel', 'dm');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'reminder';--> statement-breakpoint
CREATE TABLE "member_timezones" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_settings" (
	"guild_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"default_timezone" text DEFAULT 'UTC' NOT NULL,
	"max_per_member" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"channel_id" text NOT NULL,
	"text" varchar(500) NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"delivery" "reminder_delivery" DEFAULT 'channel' NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_settings" ADD CONSTRAINT "reminder_settings_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "reminders_member_idx" ON "reminders" USING btree ("guild_id","user_id");
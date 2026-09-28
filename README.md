# Discord bot + dashboard

A Discord bot and the web dashboard that configures it. Admins manage, per server:

- **Slash commands**: reply with a message or an embed, optionally visible only to the sender.
- **Auto-responders**: keyword or regex triggers with a per-channel cooldown.
- **Welcome messages and auto-role** for new members.
- **Scheduled messages**: one-time, daily, weekly, monthly or a custom cron, in a time zone you pick.
- **Reminders**: members set their own with `/remind`, delivered in the channel or by DM.
- **Send a message**: post as the bot in a channel, or DM a member, straight from the dashboard.
- **Activity**: a log of everything the bot did, with 7-day stats.

Everything the dashboard does goes through a REST API (`/api/*`), which you can also call from scripts.

```text
Browser ──fetch──▶ /api/* (TanStack Start server routes) ──▶ Postgres (Neon)
                        │  pg_notify('bot_config')             ▲
                        ▼                                       │
                   bot/ (discord.js) ◀── LISTEN ────────────────┘
                   writes: guilds, bot_status heartbeat, activity_log
```

The web app and the bot are separate processes that share one database. When a setting is saved, the API sends a Postgres `NOTIFY`. The bot reloads that server's config and re-registers its slash commands within a few seconds. The bot also reloads everything every 5 minutes, in case a notification is missed.

## Setup

### 1. Discord application

In the [Developer Portal](https://discord.com/developers/applications):

1. **Bot** tab:
   - Copy the token into `DISCORD_TOKEN`.
   - Under *Privileged Gateway Intents*, turn on **Server Members Intent** and **Message Content Intent**. Without both, the bot's login fails with *Used disallowed intents* (close code 4014).
2. **General Information**: copy the Application ID into `VITE_DISCORD_CLIENT_ID`. This is optional; once the bot has run, the dashboard uses the id the bot reports.

### 2. Environment

Copy `.env.example` to `.env` and fill it in:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon Postgres. The pooled URL is fine. If unset, `npm run dev` creates a claimable database for you. |
| `DATABASE_URL_DIRECT` | Optional. Used for migrations and the bot's LISTEN connection. Defaults to `DATABASE_URL` without `-pooler`. |
| `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | From the [Clerk dashboard](https://dashboard.clerk.com). |
| `ADMIN_USER_IDS` | Comma-separated Clerk user ids allowed to manage the bot. **Required.** When it's empty, nobody gets in, because Clerk sign-up is open by default. Sign in once and the dashboard shows the id to add. |
| `DASHBOARD_API_KEY` | Optional. Lets scripts call the API with an `x-api-key` header. |
| `DISCORD_TOKEN` | Used by the bot, and by the web app to list channels and roles. |

### 3. Database

```bash
npm run db:migrate          # apply migrations in ./drizzle
npm run db:generate         # after changing src/db/schema.ts
```

### 4. Run

```bash
npm run dev    # dashboard + API on http://localhost:3000
npm run bot    # the bot, restarts on file changes
```

Open the dashboard and use **Add to a server** to invite the bot. The invite asks for View Channels, Send Messages, Embed Links, Read Message History, Mention @everyone, @here, and All Roles (only used when a message is set to ping), and Manage Roles.

## REST API

Every route needs either an admin Clerk session or an `x-api-key: $DASHBOARD_API_KEY` header. Browser writes without a key are CSRF-checked.

| Method | Path | |
| --- | --- | --- |
| GET | `/api/status` | Bot presence: online flag, ping, server count |
| GET | `/api/guilds` | Servers the bot is in, with counts |
| GET | `/api/guilds/:guildId` | One server |
| GET | `/api/guilds/:guildId/channels` | Text and announcement channels (from Discord) |
| GET | `/api/guilds/:guildId/roles` | Roles, with an `assignable` flag |
| GET, POST | `/api/guilds/:guildId/commands` | List or create slash commands |
| GET, PATCH, DELETE | `/api/guilds/:guildId/commands/:id` | PATCH takes any subset of fields |
| GET, POST | `/api/guilds/:guildId/responders` | List or create auto-responders |
| GET, PATCH, DELETE | `/api/guilds/:guildId/responders/:id` | |
| GET, PUT | `/api/guilds/:guildId/welcome` | Welcome message and auto-role |
| GET, POST | `/api/guilds/:guildId/schedules` | List or create scheduled messages |
| GET, PATCH, DELETE | `/api/guilds/:guildId/schedules/:id` | The next send time is recalculated on every save |
| POST | `/api/guilds/:guildId/schedules/:id/send` | Send now, over Discord's API, without changing the schedule |
| POST | `/api/guilds/:guildId/messages` | Send a message now, to a channel or a member's DMs (see below) |
| GET | `/api/guilds/:guildId/members?query=` | Search members whose username or nickname starts with `query` (bots are excluded) |
| GET, PUT | `/api/guilds/:guildId/reminders/settings` | Turn `/remind` on or off, default time zone, per-member limit |
| GET | `/api/guilds/:guildId/reminders` | Members' upcoming reminders |
| DELETE | `/api/guilds/:guildId/reminders/:id` | Cancel a member's reminder |
| GET | `/api/guilds/:guildId/activity?type=&cursor=&limit=` | Newest first; pass `nextCursor` back as `cursor` |
| GET | `/api/stats?guildId=&days=7` | Daily counts by event type, plus top commands |

Request bodies are validated with the zod schemas in `src/lib/schemas.ts`. Invalid input returns `400` with an `issues` array, and a duplicate command name returns `409`.

```bash
curl -X POST http://localhost:3000/api/guilds/$GUILD_ID/commands \
  -H "x-api-key: $DASHBOARD_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"rules","description":"Show the rules","responseType":"text",
       "content":"Be kind, {user}.","embed":null,"ephemeral":false,"enabled":true}'
```

Messages support the placeholders `{user}`, `{user.name}`, `{server}`, `{memberCount}` and `{channel}`. Scheduled messages support `{server}`, `{memberCount}` and `{channel}`. When they mention a member, `{user}` and `{user.name}` work too.

A scheduled message's `schedule` takes one of these forms. Times are wall-clock times in the message's `timezone`, an IANA name such as `Europe/London`:

```text
{ "type": "once", "at": "2026-12-31T20:00" }
{ "type": "daily", "time": "09:00" }
{ "type": "weekly", "time": "09:00", "days": [1, 5] }
{ "type": "monthly", "time": "18:00", "day": "last" }
{ "type": "cron", "expression": "0 */6 * * *" }
```

For weekly schedules, `days` counts from 0 for Sunday. For monthly schedules, `day` is a number from 1 to 28, or `"last"`. Custom cron uses five fields and must run at least 5 minutes apart.

To ping someone each time the message sends, pass `mention`, and pass `null` to stop:

```text
{ "type": "member", "userId": "…" } | { "type": "role", "roleId": "…" } | { "type": "everyone" } | { "type": "here" }
```

The member or role must exist in the server when you save. The older `"mentionUserId": "…"` still works for pinging a member.

## Pings

Every message the dashboard sends can ping one thing: a member, a role, `@here` or `@everyone`. Choose it under **Ping** in the scheduled-message editor or on Send a message.

- **Placement**: the ping goes where you put `{ping}` in the text (or `{user}`, for a member), otherwise at the start. For embeds it goes above the embed, because mentions inside embeds don't ping.
- **Nothing else pings**: Discord only pings what the bot lists as allowed, so `@everyone`, role or member mentions typed into the text stay plain text. A message set to ping one role won't ping anyone else.
- **Permission**: `@everyone`, `@here` and roles without "Allow anyone to @mention this role" need the bot to have **Mention @everyone, @here, and All Roles** in the channel.
  - Without it, Discord posts the message but drops the ping.
  - The dashboard warns you when you pick a channel where this would happen.
  - A scheduled run whose ping was dropped shows **Sent, no ping** in the list.
  - Bots invited before this permission was added need it granted on their role in Server Settings.
- **Gone members and roles**: a member who has left, or a role that was deleted, is named as plain text, and the message still sends.

## Sending messages from the dashboard

**Send a message** posts right away as the bot, through Discord's API, so it works even while the bot process is offline. The body is:

```text
{ "target": { "type": "channel", "channelId": "…", "mention"?: <see Pings> } | { "type": "dm", "userId": "…" },
  "responseType": "text" | "embed", "content": "…", "embed": { "title", "description", "color" } | null }
```

- **Targets are checked against the server first**: the channel must be a text or announcement channel in this server, and a DM recipient must be a member of it.
- **Pings**: a channel message can ping a member, a role, `@here` or `@everyone`, as described in [Pings](#pings). DMs never ping.
- **Refused DMs**: a DM fails with a clear message when the member has turned off DMs from server members.
- **History**: every send is logged in Activity under "Sent from web", with a link to the message for channel posts and the Clerk user who sent it. The page lists the last 10.

## Reminders

Members use `/remind`, which the bot registers in every server where reminders are on:

| Command | |
| --- | --- |
| `/remind me when:<time> what:<text> [private:True]` | Accepts times like `in 2h`, `tomorrow 9am`, `friday 8pm` or `Oct 3 14:00`. With `private`, the reminder is sent by DM. |
| `/remind list` | Your upcoming reminders in this server |
| `/remind cancel reminder:<pick one>` | Cancel a reminder, with autocomplete |
| `/remind timezone zone:<zone>` | Set your time zone, which applies in every server. With no `zone`, shows your current one. |

How it behaves:

- **Time zones**: a time like "9am" is read in the member's time zone if they set one, otherwise in the server's default from the dashboard. The confirmation uses a Discord timestamp, so everyone sees the time in their own zone.
- **Delivery**: channel reminders ping only the member who set them.
- **Late reminders**: unlike scheduled messages, a reminder the bot missed while offline is still sent, with a note that it's late.
- **Deleted channels**: if the channel is gone, the reminder is sent by DM instead.
- **Failures**: a DM that fails is logged as an error, usually because the member doesn't accept DMs from server members.
- **Limits**: reminders can be set from 1 minute to 1 year ahead, with at most 500 characters and a per-member cap.
- **Reserved name**: `remind` can't be used as a custom command name.

## Deploying

- **Web app**: Vercel, as configured in `vercel.json`. Set every variable except the optional ones, including `DISCORD_TOKEN` (used for the channel and role pickers).
- **Bot**: needs a long-running host with a persistent gateway connection, such as Railway, Fly.io or a VPS. It can't run on Vercel. Run `npm ci && npm run bot:start` with `DISCORD_TOKEN` and `DATABASE_URL` set.

## Good to know

- **Owned commands**: the bot owns its *server-level* slash commands and overwrites them to match the dashboard. Global commands are never touched, and the bot ignores commands it doesn't know.
- **Auto-role hierarchy**: the bot can only give roles below its own highest role. The dashboard marks the others.
- **Deleted channels and roles**: if a saved welcome channel or role is deleted in Discord, the dashboard asks you to pick a new one.
- **Neon compute**: while the bot runs, its LISTEN connection and 30-second heartbeat keep the Neon compute awake, so it never scales to zero.
- **Activity retention**: activity is kept for 30 days.
- **Removed servers**: servers the bot leaves keep their settings, which come back if it's re-added.
- **Scheduled message timing**:
  - The bot checks for due messages every 15 seconds.
  - A run that's more than 2 minutes late, usually because the bot was offline, is skipped and logged as missed. Missed messages are never sent late.
  - Each run is claimed in a database transaction before it's sent, so a message can't go out twice, even with two bot processes running.
- **Scheduled message pings**: see [Pings](#pings). Only the one ping you choose can go through.

## Code map

- `bot/`: the discord.js process: event handlers, config cache, LISTEN client, heartbeat, scheduler and `/remind`.
- `src/db/schema.ts`: Drizzle schema. `drizzle/` holds the generated migrations.
- `src/routes/api/`: the REST API. Auth is enforced for all of `/api` by `src/routes/api/route.ts`.
- `src/routes/dashboard/`: the dashboard, client-rendered (`ssr: false`).
- `src/server/`: server-only helpers for Discord REST, auth, sending and scheduling.
- `src/lib/`: code shared by the bot and the web app, such as schemas, templates, matching, scheduling (`schedule.ts`) and the API client.
- `src/styles.css`: theme tokens, dark only.

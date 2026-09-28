# Discord bot + dashboard

A Discord bot and the web dashboard that configures it. Admins manage, per server:

- **Slash commands**: reply with a message or an embed, optionally visible only to the sender.
- **Auto-responders**: keyword or regex triggers with a per-channel cooldown.
- **Welcome messages and auto-role** for new members.
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

Open the dashboard and use **Add to a server** to invite the bot. The invite asks for View Channels, Send Messages, Embed Links, Read Message History and Manage Roles.

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
| GET | `/api/guilds/:guildId/activity?type=&cursor=&limit=` | Newest first; pass `nextCursor` back as `cursor` |
| GET | `/api/stats?guildId=&days=7` | Daily counts by event type, plus top commands |

Request bodies are validated with the zod schemas in `src/lib/schemas.ts`. Invalid input returns `400` with an `issues` array, and a duplicate command name returns `409`.

```bash
curl -X POST http://localhost:3000/api/guilds/$GUILD_ID/commands \
  -H "x-api-key: $DASHBOARD_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"rules","description":"Show the rules","responseType":"text",
       "content":"Be kind, {user}.","embed":null,"ephemeral":false,"enabled":true}'
```

Messages support the placeholders `{user}`, `{user.name}`, `{server}`, `{memberCount}` and `{channel}`.

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

## Code map

- `bot/`: the discord.js process: event handlers, config cache, LISTEN client, heartbeat.
- `src/db/schema.ts`: Drizzle schema. `drizzle/` holds the generated migrations.
- `src/routes/api/`: the REST API. Auth is enforced for all of `/api` by `src/routes/api/route.ts`.
- `src/routes/dashboard/`: the dashboard, client-rendered (`ssr: false`).
- `src/lib/`: code shared by the bot and the web app, such as schemas, templates, matching and the API client.
- `src/styles.css`: theme tokens, dark only.

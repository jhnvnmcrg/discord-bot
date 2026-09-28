import { config } from 'dotenv'

// Must be the first import in bot/index.ts: src/db reads DATABASE_URL on load.
config({ path: ['.env.local', '.env'], quiet: true })

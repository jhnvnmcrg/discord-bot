import { postgres } from 'vite-plugin-neon-new'

// Creates a claimable Neon database on first `npm run dev` when DATABASE_URL
// is missing. Tables come from Drizzle migrations (npm run db:migrate).
export default postgres({
  referrer: 'create-tanstack',
  dotEnvKey: 'DATABASE_URL',
})

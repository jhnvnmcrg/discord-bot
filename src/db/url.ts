/**
 * LISTEN/NOTIFY and migrations need a direct connection; Neon's pooler
 * (PgBouncer, transaction mode) drops session state between queries.
 * Neon pooler hosts are `ep-…-pooler.<region>…`, the direct host drops `-pooler`.
 */
export function directDatabaseUrl() {
  if (process.env.DATABASE_URL_DIRECT) return process.env.DATABASE_URL_DIRECT
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  return url.replace(/-pooler(?=\.)/, '')
}

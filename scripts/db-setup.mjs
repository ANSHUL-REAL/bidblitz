/**
 * Apply supabase/schema.sql to the project's Postgres database.
 *
 *   DATABASE_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres" \
 *   node scripts/db-setup.mjs
 *
 * If the direct connection is unreachable (Supabase direct is IPv6-only on some
 * networks), use the IPv4 pooler string instead (Settings -> Database ->
 * Connection pooling, session mode, port 5432).
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url || url.includes('[YOUR-PASSWORD]')) {
  console.error('Set DATABASE_URL with the real password (not the [YOUR-PASSWORD] placeholder).')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(resolve(here, '..', 'supabase', 'schema.sql'), 'utf8')

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
try {
  await client.connect()
  await client.query(sql)
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name"
  )
  console.log('OK — public tables now:', rows.map((r) => r.table_name).join(', '))
} catch (e) {
  console.error('FAILED:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}

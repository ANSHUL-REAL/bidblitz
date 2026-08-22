import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export const ENV_PATH = resolve(process.cwd(), '.env')

export function loadEnv() {
  if (!existsSync(ENV_PATH)) return
  try {
    process.loadEnvFile(ENV_PATH)
  } catch {
    // Node < 20.12 fallback
    for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
  }
}

/** Set keys in .env, preserving everything else. Never logs values. */
export function setEnv(updates) {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : ''
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`
    const re = new RegExp(`^${key}=.*$`, 'm')
    text = re.test(text) ? text.replace(re, line) : `${text.replace(/\s*$/, '')}\n${line}\n`
  }
  writeFileSync(ENV_PATH, text.replace(/^\n/, ''))
}

export function requireEnv(name) {
  loadEnv()
  const v = process.env[name]
  if (!v) {
    console.error(`\n  Missing ${name} in .env`)
    console.error(`  Copy .env.example to .env and fill it in.\n`)
    process.exit(1)
  }
  return v
}

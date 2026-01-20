import { defineConfig } from 'drizzle-kit'
import * as os from 'os'
import * as path from 'path'

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2))
  }
  return p
}

function getDbPath(): string {
  if (process.env.FULCRUM_DATABASE_PATH) {
    return expandPath(process.env.FULCRUM_DATABASE_PATH)
  }
  if (process.env.FULCRUM_DIR) {
    return path.join(expandPath(process.env.FULCRUM_DIR), 'fulcrum.db')
  }
  return path.join(os.homedir(), '.fulcrum', 'fulcrum.db')
}

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: getDbPath(),
  },
})

import { defineConfig } from 'drizzle-kit'
import * as os from 'os'
import * as path from 'path'

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(os.homedir(), '.vibora', 'vibora.db'),
  },
})

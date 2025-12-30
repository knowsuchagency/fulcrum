import { ViboraClient } from '../client'
import { output, isJsonOutput } from '../utils/output'

export async function handleHealthCommand(flags: Record<string, string>) {
  const client = new ViboraClient(flags.url, flags.port)
  const health = await client.health()

  if (isJsonOutput()) {
    output(health)
  } else {
    console.log(`Status: ${health.status}`)
    if (health.version) console.log(`Version: ${health.version}`)
    if (health.uptime) console.log(`Uptime: ${Math.floor(health.uptime / 1000)}s`)
  }
}

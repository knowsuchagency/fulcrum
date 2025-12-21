import { ViboraClient } from '../client'
import { output } from '../utils/output'

export async function handleHealthCommand(flags: Record<string, string>) {
  const client = new ViboraClient(flags.url, flags.port)
  const health = await client.health()
  output(health)
}

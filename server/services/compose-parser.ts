import { readFile, access } from 'fs/promises'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'
import { log } from '../lib/logger'

export interface ComposePort {
  container: number
  host?: number
  protocol?: 'tcp' | 'udp'
}

export interface ComposeService {
  name: string
  build?: {
    context: string
    dockerfile?: string
  }
  image?: string
  ports?: ComposePort[]
  environment?: Record<string, string>
  depends_on?: string[]
}

export interface ParsedComposeFile {
  file: string // Which compose file was found
  services: ComposeService[]
}

const COMPOSE_FILE_NAMES = ['compose.yml', 'compose.yaml', 'docker-compose.yml', 'docker-compose.yaml']

/**
 * Find a compose file in the given repository path
 * Checks for compose.yml, compose.yaml, docker-compose.yml, docker-compose.yaml
 */
export async function findComposeFile(repoPath: string): Promise<string | null> {
  for (const fileName of COMPOSE_FILE_NAMES) {
    const filePath = join(repoPath, fileName)
    try {
      await access(filePath)
      return fileName
    } catch {
      // File doesn't exist, try next
    }
  }
  return null
}

/**
 * Parse a port specification from docker-compose
 * Handles formats:
 *   - "8080:80" (host:container)
 *   - "80" (container only)
 *   - "8080:80/tcp" (with protocol)
 *   - { target: 80, published: 8080 } (long syntax)
 */
function parsePort(port: unknown): ComposePort | null {
  if (typeof port === 'number') {
    return { container: port }
  }

  if (typeof port === 'string') {
    // Remove protocol suffix if present
    let protocol: 'tcp' | 'udp' | undefined
    let portStr = port
    if (port.endsWith('/tcp')) {
      protocol = 'tcp'
      portStr = port.slice(0, -4)
    } else if (port.endsWith('/udp')) {
      protocol = 'udp'
      portStr = port.slice(0, -4)
    }

    // Parse host:container format
    if (portStr.includes(':')) {
      const parts = portStr.split(':')
      // Handle IP:hostPort:containerPort or hostPort:containerPort
      const containerPort = parseInt(parts[parts.length - 1], 10)
      const hostPort = parseInt(parts[parts.length - 2], 10)
      if (!isNaN(containerPort)) {
        return {
          container: containerPort,
          host: isNaN(hostPort) ? undefined : hostPort,
          protocol,
        }
      }
    } else {
      const containerPort = parseInt(portStr, 10)
      if (!isNaN(containerPort)) {
        return { container: containerPort, protocol }
      }
    }
  }

  // Long syntax object format
  if (typeof port === 'object' && port !== null) {
    const portObj = port as Record<string, unknown>
    const target = portObj.target ?? portObj.container_port
    if (typeof target === 'number') {
      return {
        container: target,
        host: typeof portObj.published === 'number' ? portObj.published : undefined,
        protocol: portObj.protocol === 'udp' ? 'udp' : 'tcp',
      }
    }
  }

  return null
}

/**
 * Parse environment variables from various formats
 */
function parseEnvironment(env: unknown): Record<string, string> {
  const result: Record<string, string> = {}

  if (Array.isArray(env)) {
    for (const item of env) {
      if (typeof item === 'string') {
        const eqIndex = item.indexOf('=')
        if (eqIndex > 0) {
          result[item.substring(0, eqIndex)] = item.substring(eqIndex + 1)
        } else {
          result[item] = ''
        }
      }
    }
  } else if (typeof env === 'object' && env !== null) {
    for (const [key, value] of Object.entries(env)) {
      result[key] = String(value ?? '')
    }
  }

  return result
}

/**
 * Parse a docker-compose file and extract services
 */
export async function parseComposeFile(repoPath: string, composeFileName?: string): Promise<ParsedComposeFile> {
  const fileName = composeFileName ?? (await findComposeFile(repoPath))
  if (!fileName) {
    throw new Error(`No compose file found in ${repoPath}`)
  }

  const filePath = join(repoPath, fileName)
  const content = await readFile(filePath, 'utf-8')
  const parsed = parseYaml(content)

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid compose file: ${fileName}`)
  }

  const services: ComposeService[] = []
  const servicesObj = (parsed as Record<string, unknown>).services

  if (!servicesObj || typeof servicesObj !== 'object') {
    log.deploy.warn('Compose file has no services defined', { file: fileName })
    return { file: fileName, services: [] }
  }

  for (const [name, config] of Object.entries(servicesObj as Record<string, unknown>)) {
    if (!config || typeof config !== 'object') continue

    const serviceConfig = config as Record<string, unknown>
    const service: ComposeService = { name }

    // Parse build config
    if (serviceConfig.build) {
      if (typeof serviceConfig.build === 'string') {
        service.build = { context: serviceConfig.build }
      } else if (typeof serviceConfig.build === 'object') {
        const buildConfig = serviceConfig.build as Record<string, unknown>
        service.build = {
          context: String(buildConfig.context ?? '.'),
          dockerfile: buildConfig.dockerfile ? String(buildConfig.dockerfile) : undefined,
        }
      }
    }

    // Parse image
    if (typeof serviceConfig.image === 'string') {
      service.image = serviceConfig.image
    }

    // Parse ports
    if (Array.isArray(serviceConfig.ports)) {
      service.ports = serviceConfig.ports.map(parsePort).filter((p): p is ComposePort => p !== null)
    }

    // Parse environment
    if (serviceConfig.environment) {
      service.environment = parseEnvironment(serviceConfig.environment)
    }

    // Parse depends_on
    if (Array.isArray(serviceConfig.depends_on)) {
      service.depends_on = serviceConfig.depends_on.filter((d): d is string => typeof d === 'string')
    } else if (typeof serviceConfig.depends_on === 'object' && serviceConfig.depends_on !== null) {
      // Long form: depends_on: { db: { condition: service_healthy } }
      service.depends_on = Object.keys(serviceConfig.depends_on)
    }

    services.push(service)
  }

  log.deploy.info('Parsed compose file', { file: fileName, serviceCount: services.length })
  return { file: fileName, services }
}

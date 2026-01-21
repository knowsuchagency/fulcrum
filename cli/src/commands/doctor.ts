import { defineCommand } from 'citty'
import { checkAllDependencies, getInstallCommand, getDependency } from '../utils/dependencies'
import { output } from '../utils/output'
import { globalArgs, toFlags, setupJsonOutput } from './shared'

/**
 * Handle the `fulcrum doctor` command.
 * Shows the status of all dependencies with versions and install commands.
 */
export async function handleDoctorCommand(flags: Record<string, string>) {
  const deps = checkAllDependencies()

  // Human-readable by default, --json for machine output
  if (flags.json === 'true') {
    output(deps)
    return
  }

  console.log('\nFulcrum Doctor')
  console.log('=============\n')

  // Required dependencies
  console.log('Required:')
  for (const dep of deps.filter((d) => d.required)) {
    const icon = dep.installed ? '\u2713' : '\u2717'
    const version = dep.version || '-'
    console.log(`  ${icon} ${dep.name.padEnd(10)} ${version.padEnd(20)} ${dep.description}`)
  }

  // Optional dependencies
  console.log('\nOptional:')
  for (const dep of deps.filter((d) => !d.required)) {
    const icon = dep.installed ? '\u2713' : '\u25cb'
    const version = dep.version || '-'
    console.log(`  ${icon} ${dep.name.padEnd(10)} ${version.padEnd(20)} ${dep.description}`)
  }

  // Summary
  const requiredDeps = deps.filter((d) => d.required)
  const requiredInstalled = requiredDeps.filter((d) => d.installed).length
  const requiredTotal = requiredDeps.length

  console.log(`\nStatus: ${requiredInstalled} of ${requiredTotal} required dependencies installed`)

  // Show install commands for missing required deps
  const requiredMissing = requiredDeps.filter((d) => !d.installed)
  if (requiredMissing.length > 0) {
    console.log('\nMissing required dependencies:')
    for (const dep of requiredMissing) {
      const fullDep = getDependency(dep.name)
      if (fullDep) {
        console.log(`  ${dep.name}: ${getInstallCommand(fullDep)}`)
      }
    }
    console.log('\nRun `fulcrum up` to install missing dependencies.')
  } else {
    console.log('\n\u2713 All required dependencies installed!')
  }

  // Show optional missing deps
  const optionalMissing = deps.filter((d) => !d.required && !d.installed)
  if (optionalMissing.length > 0) {
    console.log('\nOptional dependencies not installed:')
    for (const dep of optionalMissing) {
      const fullDep = getDependency(dep.name)
      if (fullDep) {
        console.log(`  ${dep.name}: ${getInstallCommand(fullDep)}`)
      }
    }
  }

  console.log('')
}

// ============================================================================
// Command Definition
// ============================================================================

export const doctorCommand = defineCommand({
  meta: { name: 'doctor', description: 'Check dependencies and system status' },
  args: globalArgs,
  async run({ args }) {
    setupJsonOutput(args)
    await handleDoctorCommand(toFlags(args))
  },
})

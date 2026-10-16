import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function selectBuildContext({ event, ref, sha, buildWindows, buildLinux }) {
  if (!['push', 'pull_request', 'workflow_dispatch'].includes(event)) {
    throw new Error('Unsupported build event')
  }
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid build SHA')

  const publish = event !== 'pull_request' && /^refs\/tags\/v\d+\.\d+\.\d+$/.test(ref)
  const manual = event === 'workflow_dispatch'
  const manualBranch = manual && /^refs\/heads\/.+$/.test(ref)
  const channel = event === 'pull_request' || ref === 'refs/heads/dev' || (manualBranch && ref !== 'refs/heads/main') ? 'dev' : 'stable'

  if (event !== 'pull_request' && !publish && !manualBranch && !['refs/heads/main', 'refs/heads/dev'].includes(ref)) {
    throw new Error('Only main, dev, manually selected branches and official version tags can be built')
  }

  return {
    channel,
    'short-sha': sha.slice(0, 8),
    'build-windows': String(publish || (manual && buildWindows === 'true')),
    'build-linux': String(publish || (manual && buildLinux === 'true')),
    publish: String(publish),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const context = selectBuildContext({
    event: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
    buildWindows: process.env.BUILD_WINDOWS,
    buildLinux: process.env.BUILD_LINUX,
  })
  const output = Object.entries(context).map(([key, value]) => `${key}=${value}\n`).join('')
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
  appendFileSync(process.env.GITHUB_OUTPUT, output)
  console.log(output)
}

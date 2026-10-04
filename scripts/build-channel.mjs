import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function isMobilePullRequest(event, headRef) {
  if (event !== 'pull_request') return false
  return /^codex\/mobile-/.test(headRef || '') || /^mobile\//.test(headRef || '')
}

export function selectBuildContext({ event, ref, sha, headRef, buildWindows, buildLinux }) {
  if (!['push', 'pull_request', 'workflow_dispatch'].includes(event)) {
    throw new Error('Unsupported build event')
  }
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid build SHA')
  const publish = event !== 'pull_request' && /^refs\/tags\/v\d+\.\d+\.\d+$/.test(ref)
  const channel = event === 'pull_request' || ref === 'refs/heads/dev' ? 'dev' : 'stable'
  const mobilePr = isMobilePullRequest(event, headRef)
  if (event !== 'pull_request' && !publish && !['refs/heads/main', 'refs/heads/dev'].includes(ref)) {
    throw new Error('Only main, dev and official version tags can be built')
  }
  return {
    channel,
    'short-sha': sha.slice(0, 8),
    'build-windows': String(!mobilePr && (publish || event !== 'workflow_dispatch' || buildWindows === 'true')),
    'build-linux': String(!mobilePr && (publish || (event === 'workflow_dispatch' ? buildLinux === 'true' : channel === 'stable'))),
    publish: String(publish),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const context = selectBuildContext({
    event: process.env.GITHUB_EVENT_NAME,
    ref: process.env.GITHUB_REF,
    sha: process.env.GITHUB_SHA,
    headRef: process.env.GITHUB_HEAD_REF,
    buildWindows: process.env.BUILD_WINDOWS,
    buildLinux: process.env.BUILD_LINUX,
  })
  const output = Object.entries(context).map(([key, value]) => `${key}=${value}\n`).join('')
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required')
  appendFileSync(process.env.GITHUB_OUTPUT, output)
  console.log(output)
}

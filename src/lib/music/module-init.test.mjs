import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

for (const entry of ['../api/client.ts', '../db/cache.ts', './service.ts', './providers/netease.ts']) {
  const script = `await import(${JSON.stringify(new URL(entry, import.meta.url).href)}); const { musicProviders } = await import(${JSON.stringify(new URL('./service.ts', import.meta.url).href)}); if (musicProviders.getActive().id !== 'netease') throw new Error('Default provider did not initialize')`
  const result = spawnSync(process.execPath, ['--input-type=module', '--experimental-strip-types', '--disable-warning=ExperimentalWarning', '--eval', script], { encoding: 'utf8' })
  assert.equal(result.status, 0, `${entry} must initialize without circular-import errors:\n${result.stderr}`)
}

console.log('Music module initialization: client, cache, service and provider entry orders passed')

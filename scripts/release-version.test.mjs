import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { calculateReleaseVersion } = require('./release-version.cjs')

assert.deepEqual(
  calculateReleaseVersion({
    latestTag: 'v1.3.0',
    sourceVersion: '1.4.0',
    bump: 'auto',
    hasFeature: false,
  }),
  {
    version: '1.4.0',
    tag: 'v1.4.0',
    bump: 'patch',
  },
  'manual source version above latest tag should be released as-is',
)

assert.equal(
  calculateReleaseVersion({
    latestTag: 'v1.3.0',
    sourceVersion: '1.4.0',
    bump: 'major',
  }).version,
  '2.0.0',
  'explicit bump that is newer than source should still be honored',
)

console.log('release version calculation self-check passed')

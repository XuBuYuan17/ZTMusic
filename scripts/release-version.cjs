const SEMVER = /^\d+\.\d+\.\d+$/
const TAG_SEMVER = /^v(\d+\.\d+\.\d+)$/

function parseVersion(version, label) {
  if (!SEMVER.test(version)) throw new Error(`${label} is not valid semver: ${version}`)
  return version.split('.').map(Number)
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left, 'Left version')
  const rightParts = parseVersion(right, 'Right version')
  for (let index = 0; index < 3; index++) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index]
  }
  return 0
}

function bumpVersion(version, bump) {
  let [major, minor, patch] = parseVersion(version, 'Base version')
  if (bump === 'major') {
    major++
    minor = 0
    patch = 0
  } else if (bump === 'minor') {
    minor++
    patch = 0
  } else if (bump === 'patch') {
    patch++
  } else {
    throw new Error(`Unknown version bump: ${bump}`)
  }
  return `${major}.${minor}.${patch}`
}

function calculateReleaseVersion({ latestTag, sourceVersion, bump, hasBreaking = false, hasFeature = false }) {
  const tagMatch = latestTag.match(TAG_SEMVER)
  if (!tagMatch) throw new Error(`Latest tag is not valid semver: ${latestTag}`)
  parseVersion(sourceVersion, 'Source version')

  const latestVersion = tagMatch[1]
  const resolvedBump = bump === 'auto'
    ? (hasBreaking ? 'major' : hasFeature ? 'minor' : 'patch')
    : bump
  const bumpedVersion = bumpVersion(latestVersion, resolvedBump)

  const version = compareVersions(sourceVersion, latestVersion) > 0
    ? (compareVersions(sourceVersion, bumpedVersion) >= 0 ? sourceVersion : bumpedVersion)
    : bumpedVersion

  return {
    version,
    tag: `v${version}`,
    bump: resolvedBump,
  }
}

module.exports = {
  calculateReleaseVersion,
  compareVersions,
}

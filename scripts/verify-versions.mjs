import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [packageText, tauriText, cargoToml, cargoLock] = await Promise.all([
  read('package.json'),
  read('src-tauri/tauri.conf.json'),
  read('src-tauri/Cargo.toml'),
  read('src-tauri/Cargo.lock'),
])

const packageJson = JSON.parse(packageText)
const tauriConfig = JSON.parse(tauriText)
const cargoVersion = cargoToml.match(/^version = "([^"]+)"/m)?.[1]
const lockVersion = cargoLock.match(/\[\[package\]\]\r?\nname = "zheting"\r?\nversion = "([^"]+)"/)?.[1]

assert.ok(cargoVersion, 'src-tauri/Cargo.toml is missing the package version')
assert.ok(lockVersion, 'src-tauri/Cargo.lock is missing the zheting package')
assert.equal(tauriConfig.version, packageJson.version, 'tauri.conf.json version does not match package.json')
assert.equal(cargoVersion, packageJson.version, 'Cargo.toml version does not match package.json')
assert.equal(lockVersion, packageJson.version, 'Cargo.lock version does not match package.json')

if (process.env.GITHUB_REF_TYPE === 'tag') {
  assert.equal(
    process.env.GITHUB_REF_NAME,
    `v${packageJson.version}`,
    'release tag does not match package.json version',
  )
}

console.log(`release version self-check passed: ${packageJson.version}`)

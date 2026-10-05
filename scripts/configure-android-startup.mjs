import { cp, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const project = resolve(process.argv[2] || resolve(root, 'src-tauri/gen/android'))
const app = resolve(project, 'app')
const source = resolve(root, 'src-tauri/android')
const gradlePath = resolve(app, 'build.gradle.kts')
let gradle = await readFile(gradlePath, 'utf8')
const packageName = gradle.match(/namespace\s*=\s*"([A-Za-z0-9_.]+)"/)?.[1]
if (!packageName) throw new Error('Generated Android namespace was not found')
const mainDirectory = resolve(app, 'src/main')
const activityPath = resolve(mainDirectory, 'java', ...packageName.split('.'), 'MainActivity.kt')
await mkdir(dirname(activityPath), { recursive: true })
await writeFile(activityPath, (await readFile(resolve(source, 'MainActivity.kt'), 'utf8')).replace('__PACKAGE__', packageName))
await cp(resolve(source, 'res'), resolve(mainDirectory, 'res'), { recursive: true })
await copyFile(resolve(root, 'src-tauri/icons/icon.png'), resolve(mainDirectory, 'res/drawable/zt_portrait.png'))

const manifestPath = resolve(mainDirectory, 'AndroidManifest.xml')
let manifest = await readFile(manifestPath, 'utf8')
const launcher = manifest.match(/<activity\b[^>]*android:name="\.MainActivity"[^>]*>/s)?.[0]
if (!launcher) throw new Error('Generated MainActivity launcher was not found')
const themed = launcher.replace(/\s+android:theme="[^"]*"/, '').replace(/>$/, '\n            android:theme="@style/Theme.ZTMusic.Starting">')
manifest = manifest.replace(launcher, themed)
await writeFile(manifestPath, manifest)
if (!gradle.includes('androidx.core:core-splashscreen:')) {
  gradle = gradle.replace(/dependencies\s*\{/, 'dependencies {\n    implementation("androidx.core:core-splashscreen:1.0.1")')
  await writeFile(gradlePath, gradle)
}
console.log('System SplashScreen and shared adaptive portrait configured for ' + packageName)

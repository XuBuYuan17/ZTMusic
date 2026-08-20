import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const required = ['ANDROID_KEY_BASE64', 'ANDROID_KEY_ALIAS', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_PASSWORD']
const missing = required.filter((name) => !process.env[name]?.trim())

if (missing.length > 0) {
  throw new Error(`Missing Android signing secrets: ${missing.join(', ')}`)
}

const androidRoot = join(process.cwd(), 'src-tauri', 'gen', 'android')
const appGradlePath = join(androidRoot, 'app', 'build.gradle.kts')
const keystorePath = join(process.env.RUNNER_TEMP || androidRoot, 'zheting-upload-keystore.jks')

await mkdir(androidRoot, { recursive: true })
await writeFile(keystorePath, Buffer.from(process.env.ANDROID_KEY_BASE64, 'base64'))
await writeFile(
  join(androidRoot, 'keystore.properties'),
  [
    `storePassword=${process.env.ANDROID_KEYSTORE_PASSWORD}`,
    `keyPassword=${process.env.ANDROID_KEY_PASSWORD}`,
    `keyAlias=${process.env.ANDROID_KEY_ALIAS}`,
    `storeFile=${keystorePath.replaceAll('\\', '/')}`,
    ''
  ].join('\n')
)

let gradle = await readFile(appGradlePath, 'utf8')

if (!gradle.includes('import java.util.Properties')) {
  gradle = `import java.util.Properties\n${gradle}`
}

if (!gradle.includes('import java.io.FileInputStream')) {
  gradle = gradle.replace('import java.util.Properties\n', 'import java.util.Properties\nimport java.io.FileInputStream\n')
}

if (!gradle.includes('create("release")')) {
  gradle = gradle.replace(
    /(\nandroid\s*\{)/,
    `
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

$1`
  )

  gradle = gradle.replace(
    /(\n\s*)buildTypes\s*\{/,
    `$1signingConfigs {
$1    create("release") {
$1        keyAlias = keystoreProperties["keyAlias"] as String
$1        keyPassword = keystoreProperties["keyPassword"] as String
$1        storeFile = file(keystoreProperties["storeFile"] as String)
$1        storePassword = keystoreProperties["storePassword"] as String
$1    }
$1}

$1buildTypes {`
  )
}

if (!gradle.includes('signingConfig = signingConfigs.getByName("release")')) {
  gradle = gradle.replace(
    /getByName\("release"\)\s*\{/,
    'getByName("release") {\n            signingConfig = signingConfigs.getByName("release")'
  )
}

await writeFile(appGradlePath, gradle)

console.log('Android release signing configured')

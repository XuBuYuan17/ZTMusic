import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const sourceRoot = resolve(root, 'src')

async function findTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const tests = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) return findTests(path)
    return entry.isFile() && /\.test\.m?js$/.test(entry.name) ? [path] : []
  }))
  return tests.flat()
}

// scripts/ 下的构建工具自检（*.test.mjs）也要跑，否则改坏了没人发现
const tests = [
  ...await findTests(sourceRoot),
  ...await findTests(resolve(root, 'scripts')),
].sort()

if (tests.length === 0) {
  console.error('No test files found under src/')
  process.exitCode = 1
} else {
  let failures = 0

  for (const test of tests) {
    const name = relative(root, test)
    console.log(`\n> ${name}`)

    // These self-checks install browser globals and patch module singletons. A
    // fresh process per file prevents one test's runtime from leaking into the
    // next while keeping their existing direct-execution contract intact.
    const result = spawnSync(process.execPath, [test], {
      cwd: root,
      stdio: 'inherit',
    })

    if (result.error) {
      console.error(`Unable to run ${name}:`, result.error)
      failures++
    } else if (result.status !== 0) {
      failures++
    }
  }

  console.log(`\n${tests.length - failures}/${tests.length} test files passed`)
  process.exitCode = failures === 0 ? 0 : 1
}

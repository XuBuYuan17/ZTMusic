import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migratedFiles = [
  '../components/SearchOverlay.svelte',
  '../pages/SearchPage.svelte',
  '../services/details.js',
  '../services/lyrics-loader.js',
  '../player/url-resolver.js',
  '../player/prefetch.js',
]

for (const file of migratedFiles) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8')
  assert.doesNotMatch(source, /\bncm\./, `${file} must use musicService instead of ncm`)
  assert.doesNotMatch(source, /api\/client\.js/, `${file} must not import the provider-specific client`)
}

console.log(`music provider boundary: ${migratedFiles.length * 2} assertions passed`)

import assert from 'node:assert/strict'
import { SETTING_DEFAULTS, SETTING_DEFINITIONS, SETTINGS_CATEGORIES, settingsFields, settingOptions, settingValueForLayout, storedSettingDefinition } from './definitions.ts'
import { QUALITY_OPTIONS, QUALITY_ORDER, QUALITY_LABELS } from '../player/quality.ts'
import { QUALITY_ORDER as legacyOrder } from '../utils/constants.ts'
import { settingsCategoryGroups, settingsView, settingsCategory } from '../pages/settings-navigation.ts'
import { zh } from '../i18n/zh.js'
import { en } from '../i18n/en.js'
import { getBooleanSetting, getSetting, setSetting, migrateSettings, SETTINGS_SCHEMA_VERSION } from '../utils/settings.ts'

const store = new Map<string, string>()
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, String(value)) },
  removeItem: (key: string) => { store.delete(key) },
} as unknown as Storage

assert.deepEqual(SETTING_DEFAULTS, {
  default_page: 'home', layout_mode: 'auto', lyrics_blur_effect: 'true', lyrics_text_blur_effect: 'true',
  wallpaper_video_play: 'true', accent_theme: 'red', restore_session: 'true', volume: '0.8', mode: 'list', preferred_quality: 'standard',
}, 'existing persisted keys and defaults must remain unchanged')
assert.equal(SETTINGS_SCHEMA_VERSION, 4, 'a metadata refactor requires no data migration version bump')
assert.ok(!('theme' in SETTING_DEFAULTS) && !('locale' in SETTING_DEFAULTS), 'externally owned preferences must not be seeded by settings migration')
assert.equal(legacyOrder, QUALITY_ORDER)
assert.equal(SETTING_DEFINITIONS.lyrics_blur_effect.changeEvent, 'lyrics-blur-change')
assert.equal(SETTING_DEFINITIONS.lyrics_text_blur_effect.changeEvent, 'lyrics-text-blur-change')
assert.deepEqual(QUALITY_ORDER, QUALITY_OPTIONS.map(option => option.value))
assert.deepEqual(Object.keys(QUALITY_LABELS), QUALITY_ORDER)

const groups = settingsCategoryGroups(true)
assert.deepEqual(groups.flat().map(category => category.id), SETTINGS_CATEGORIES.map(category => category.id), 'every registered category appears in one derived group')
assert.equal(new Set(groups.flat().map(category => category.id)).size, SETTINGS_CATEGORIES.length)
assert.ok(!settingsCategoryGroups(false).flat().some(category => category.id === 'android'))
const fieldKeys: string[] = []
for (const category of SETTINGS_CATEGORIES) {
  assert.equal(settingsCategory(settingsView(category.id)), category.id)
  for (const dictionary of [zh, en]) {
    for (const key of [category.titleKey, category.sectionKey]) assert.ok((dictionary as Record<string, string>)[key], `missing category text: ${key}`)
  }
  for (const field of settingsFields(category.id)) {
    fieldKeys.push(field.key)
    for (const dictionary of [zh, en]) {
      assert.ok((dictionary as Record<string, string>)[field.labelKey], `missing field text: ${field.labelKey}`)
      if (field.descriptionKey) assert.ok((dictionary as Record<string, string>)[field.descriptionKey])
      if (field.kind === 'select') for (const option of field.options) {
        if (option.labelKey) assert.ok((dictionary as Record<string, string>)[option.labelKey], `missing option text: ${option.labelKey}`)
        else assert.ok(option.label)
      }
    }
  }
}
assert.equal(fieldKeys.length, 8)
assert.equal(new Set(fieldKeys).size, fieldKeys.length)
assert.deepEqual(settingOptions(SETTING_DEFINITIONS.default_page, true).map(option => option.value), ['explore', 'library'])
assert.deepEqual(settingOptions(SETTING_DEFINITIONS.default_page, false).map(option => option.value), ['home', 'explore', 'library'])
assert.equal(settingValueForLayout(SETTING_DEFINITIONS.default_page, 'library', true), 'library', 'mobile startup honors the chosen library page')
assert.equal(settingValueForLayout(SETTING_DEFINITIONS.default_page, 'home', true), 'explore', 'legacy home remains mapped to the first supported mobile option')
assert.equal(settingValueForLayout(SETTING_DEFINITIONS.default_page, 'home', false), 'home')
assert.equal(settingValueForLayout(SETTING_DEFINITIONS.preferred_quality, 'invalid', false), 'standard')

for (const [key, fallback] of Object.entries(SETTING_DEFAULTS)) {
  const definition = storedSettingDefinition(key)!
  assert.equal(setSetting(key, fallback), fallback)
  if (definition.kind === 'boolean') {
    assert.equal(setSetting(key, false), 'false')
    assert.equal(getBooleanSetting(key), false)
    assert.equal(setSetting(key, 'invalid'), fallback)
  } else if (definition.kind === 'select') {
    assert.ok(definition.options.some(option => option.value === fallback), `${key} default must be one of its declared choices`)
    for (const option of definition.options) assert.equal(setSetting(key, option.value), option.value)
    assert.equal(setSetting(key, 'invalid'), fallback, `${key} validation must use its declared choices`)
  } else {
    const value = Number(fallback)
    assert.ok(Number.isFinite(value) && value >= definition.min && value <= definition.max)
  }
}
assert.equal(setSetting('volume', -1), '0')
assert.equal(setSetting('volume', 2), '1')
assert.equal(setSetting('volume', 'invalid'), '0.8')
assert.equal(setSetting('external_custom_key', 'custom-value'), 'custom-value')
assert.equal(getSetting('external_custom_key'), 'custom-value', 'unknown keys retain their existing storage contract')
assert.equal(storedSettingDefinition('theme'), undefined)
store.clear()
assert.equal(migrateSettings().changed, true)
assert.equal(migrateSettings().changed, false, 'migration remains idempotent')
for (const [key, fallback] of Object.entries(SETTING_DEFAULTS)) assert.equal(store.get(key), fallback)
console.log('settings definitions: category coverage, translations, options, storage compatibility, quality and migration passed')

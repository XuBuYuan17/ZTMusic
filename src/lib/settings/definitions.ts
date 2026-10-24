import { QUALITY_OPTIONS } from '../player/quality.ts'
import { ACCENT_THEME_OPTIONS } from '../theme/accent.ts'

export interface SettingsSummaryContext {
  theme: string
  quality: string
  pluginCount: number
  locale: string
  loggedIn: boolean
  version: string
}
export type SettingsText = (key: string) => string

interface CategoryDefinition {
  id: string
  titleKey: string
  sectionKey: string
  icon: string
  group: number
  requires?: 'android'
  summary: (context: SettingsSummaryContext, text: SettingsText) => string
}

export const SETTINGS_CATEGORIES = [
  { id: 'appearance', titleKey: 'settings.category.appearance', sectionKey: 'settings.section.appearance', icon: 'sun', group: 0,
    summary: (context, text) => text(context.theme === 'light' ? 'settings.theme.light' : 'settings.theme.dark') },
  { id: 'playback', titleKey: 'settings.category.playback', sectionKey: 'settings.section.playback', icon: 'lyrics', group: 0,
    summary: context => context.quality },
  { id: 'sources', titleKey: 'settings.category.sources', sectionKey: 'settings.section.sources', icon: 'music', group: 1,
    summary: (context, text) => text('settings.summary.sources').replace('{count}', String(context.pluginCount)) },
  { id: 'android', titleKey: 'settings.category.android', sectionKey: 'settings.section.android', icon: 'grid', group: 1, requires: 'android',
    summary: (_context, text) => text('settings.summary.android') },
  { id: 'general', titleKey: 'settings.category.general', sectionKey: 'settings.section.general', icon: 'settings', group: 2,
    summary: context => context.locale === 'en' ? 'English' : '中文' },
  { id: 'data', titleKey: 'settings.category.data', sectionKey: 'settings.section.data', icon: 'user', group: 2,
    summary: (context, text) => text(context.loggedIn ? 'settings.summary.loggedIn' : 'settings.summary.loggedOut') },
  { id: 'advanced', titleKey: 'settings.category.advanced', sectionKey: 'settings.section.advanced', icon: 'folder', group: 2,
    summary: (_context, text) => text('settings.summary.advanced') },
  { id: 'about', titleKey: 'settings.category.about', sectionKey: 'settings.section.about', icon: 'info', group: 2,
    summary: context => context.version },
] as const satisfies readonly CategoryDefinition[]

export type SettingsCategory = typeof SETTINGS_CATEGORIES[number]['id']

export interface SettingOption { value: string; labelKey?: string; label?: string; desktopOnly?: boolean }
interface FieldMetadata { category?: SettingsCategory; labelKey?: string; descriptionKey?: string }
type BooleanDefinition = FieldMetadata & { kind: 'boolean'; defaultValue: 'true' | 'false'; changeEvent?: string }
type SelectDefinition = FieldMetadata & { kind: 'select'; defaultValue?: string; options: readonly SettingOption[] }
type NumberDefinition = { kind: 'number'; defaultValue: string; min: number; max: number }
export type SettingDefinition = BooleanDefinition | SelectDefinition | NumberDefinition

export const SETTING_DEFINITIONS = {
  theme: { kind: 'select', category: 'appearance', labelKey: 'settings.theme', options: [
    { value: 'light', labelKey: 'settings.theme.light' }, { value: 'dark', labelKey: 'settings.theme.dark' },
  ] },
  preferred_quality: { kind: 'select', defaultValue: 'standard', category: 'playback', labelKey: 'settings.quality', options: QUALITY_OPTIONS },
  restore_session: { kind: 'boolean', defaultValue: 'true', category: 'playback', labelKey: 'settings.restoreSession' },
  lyrics_blur_effect: { kind: 'boolean', defaultValue: 'true', category: 'playback', labelKey: 'settings.lyricsBlur', changeEvent: 'lyrics-blur-change' },
  lyrics_text_blur_effect: { kind: 'boolean', defaultValue: 'true', category: 'playback', labelKey: 'settings.lyricsTextBlur', changeEvent: 'lyrics-text-blur-change' },
  locale: { kind: 'select', category: 'general', labelKey: 'settings.language', descriptionKey: 'settings.languageDesc', options: [
    { value: 'zh', label: '中文' }, { value: 'en', label: 'English' },
  ] },
  default_page: { kind: 'select', defaultValue: 'home', category: 'general', labelKey: 'settings.defaultPage', descriptionKey: 'settings.defaultPageDesc', options: [
    { value: 'home', labelKey: 'page.home', desktopOnly: true }, { value: 'explore', labelKey: 'page.explore' }, { value: 'library', labelKey: 'page.library' },
  ] },
  layout_mode: { kind: 'select', defaultValue: 'auto', category: 'general', labelKey: 'settings.layout', descriptionKey: 'settings.layoutDesc', options: [
    { value: 'auto', labelKey: 'settings.layout.auto' }, { value: 'pc', labelKey: 'settings.layout.pc' }, { value: 'mobile', labelKey: 'settings.layout.mobile' },
  ] },
  wallpaper_video_play: { kind: 'boolean', defaultValue: 'true' },
  accent_theme: { kind: 'select', defaultValue: 'red', options: ACCENT_THEME_OPTIONS },
  volume: { kind: 'number', defaultValue: '0.8', min: 0, max: 1 },
  mode: { kind: 'select', defaultValue: 'list', options: [{ value: 'list' }, { value: 'shuffle' }, { value: 'repeat' }] },
} as const satisfies Record<string, SettingDefinition>

export type SettingFieldKey = {
  [K in keyof typeof SETTING_DEFINITIONS]: typeof SETTING_DEFINITIONS[K] extends { category: SettingsCategory } ? K : never
}[keyof typeof SETTING_DEFINITIONS]
export type SettingField = (BooleanDefinition | SelectDefinition) & { key: SettingFieldKey; category: SettingsCategory; labelKey: string }
export type StoredSettingDefinition = SettingDefinition & { defaultValue: string }

export function storedSettingDefinition(key: string): StoredSettingDefinition | undefined {
  const definition = (SETTING_DEFINITIONS as Record<string, SettingDefinition>)[key]
  return definition && 'defaultValue' in definition && typeof definition.defaultValue === 'string'
    ? definition as StoredSettingDefinition : undefined
}

export const SETTING_DEFAULTS: Record<string, string> = Object.fromEntries(
  Object.keys(SETTING_DEFINITIONS).flatMap(key => {
    const definition = storedSettingDefinition(key)
    return definition ? [[key, definition.defaultValue]] : []
  }),
)

export function settingsFields(category: SettingsCategory): SettingField[] {
  return Object.entries(SETTING_DEFINITIONS)
    .filter(([, definition]) => 'category' in definition && definition.category === category)
    .map(([key, definition]) => ({ ...definition, key })) as SettingField[]
}

export function settingOptions(field: SelectDefinition, mobile: boolean): SettingOption[] {
  return field.options.filter(option => !mobile || !option.desktopOnly)
}

export function settingValueForLayout(field: SelectDefinition, value: string, mobile: boolean): string {
  const options = settingOptions(field, mobile)
  if (options.some(option => option.value === value)) return value
  return options.find(option => option.value === field.defaultValue)?.value ?? options[0]?.value ?? value
}

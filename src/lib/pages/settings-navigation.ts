import { SETTINGS_CATEGORIES, type SettingsCategory, type SettingsSummaryContext, type SettingsText } from '../settings/definitions.ts'
import { zh } from '../i18n/zh.js'
export { SETTINGS_CATEGORIES }
export type { SettingsCategory }

export function settingsView(category: SettingsCategory): string {
  return `settings-${category}`
}

export function settingsCategory(view: string): SettingsCategory | null {
  return SETTINGS_CATEGORIES.find(item => view === settingsView(item.id))?.id ?? null
}

export function settingsCategories(android: boolean) {
  return SETTINGS_CATEGORIES.filter(item => android || !('requires' in item))
}

export function settingsCategoryGroups(android: boolean) {
  const groups = new Map<number, ReturnType<typeof settingsCategories>>()
  for (const category of settingsCategories(android)) {
    const group = groups.get(category.group) ?? []
    group.push(category)
    groups.set(category.group, group)
  }
  return [...groups.values()]
}

export function settingsSummaries(input: SettingsSummaryContext, text: SettingsText = key => zh[key as keyof typeof zh] ?? key): Record<SettingsCategory, string> {
  return Object.fromEntries(SETTINGS_CATEGORIES.map(category => [category.id, category.summary(input, text)])) as Record<SettingsCategory, string>
}

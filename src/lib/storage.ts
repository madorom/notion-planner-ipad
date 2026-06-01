import type { AppConfig } from "@/lib/types";

const CONFIG_KEY = "notion-planner-ipad:v1";
const CONFIGS_KEY = "notion-planner-ipad:configs:v1";
const HIDDEN_STATUSES_KEY = "notion-planner-ipad:hidden-statuses:v1";
const SELECTED_NOTION_CONFIG_IDS_KEY =
  "notion-planner-ipad:selected-notion-configs:v1";
const THEME_MODE_KEY = "notion-planner-ipad:theme:v1";
const INTERACTION_MODE_KEY = "notion-planner-ipad:interaction-mode:v1";
const SHOW_ALL_DAY_TASKS_KEY = "notion-planner-ipad:show-all-day:v1";
const WEEK_VISIBLE_DAYS_KEY = "notion-planner-ipad:week-visible-days:v1";
const GOOGLE_CALENDAR_ID_KEY = "notion-planner-ipad:google-calendar-id:v1";
const GOOGLE_CALENDAR_IDS_KEY = "notion-planner-ipad:google-calendar-ids:v1";
const GOOGLE_CALENDAR_COLORS_KEY =
  "notion-planner-ipad:google-calendar-colors:v1";

export type ThemeMode = "light" | "dark";
export type InteractionMode = "view" | "change";

export const DEFAULT_WEEK_VISIBLE_DAYS = 7;
export const MIN_WEEK_VISIBLE_DAYS = 1;
export const MAX_WEEK_VISIBLE_DAYS = 7;

export function clampWeekVisibleDays(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : DEFAULT_WEEK_VISIBLE_DAYS;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_WEEK_VISIBLE_DAYS;
  }

  return Math.min(
    MAX_WEEK_VISIBLE_DAYS,
    Math.max(MIN_WEEK_VISIBLE_DAYS, Math.round(parsed)),
  );
}

export function loadConfig(): AppConfig | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(CONFIG_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as AppConfig & { token?: string };
    if ("token" in parsed) {
      delete parsed.token;
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(parsed));
    }

    return parsed;
  } catch {
    window.localStorage.removeItem(CONFIG_KEY);
    return null;
  }
}

export function saveConfig(config: AppConfig) {
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  saveKnownConfig(config);
}

export function clearConfig() {
  window.localStorage.removeItem(CONFIG_KEY);
}

export function appConfigKey(config: AppConfig) {
  return config.dataSourceId ?? config.targetId;
}

export function loadKnownConfigs() {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(CONFIGS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is AppConfig => {
          return (
            value &&
            typeof value === "object" &&
            typeof value.targetId === "string" &&
            Array.isArray(value.properties) &&
            value.mapping &&
            typeof value.mapping.title === "string" &&
            typeof value.mapping.date === "string"
          );
        })
      : [];
  } catch {
    window.localStorage.removeItem(CONFIGS_KEY);
    return [];
  }
}

export function saveKnownConfig(config: AppConfig) {
  const configs = loadKnownConfigs();
  const next = [
    config,
    ...configs.filter((item) => appConfigKey(item) !== appConfigKey(config)),
  ].slice(0, 20);
  window.localStorage.setItem(CONFIGS_KEY, JSON.stringify(next));
}

export function loadSelectedNotionConfigIds() {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(SELECTED_NOTION_CONFIG_IDS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    window.localStorage.removeItem(SELECTED_NOTION_CONFIG_IDS_KEY);
    return [];
  }
}

export function saveSelectedNotionConfigIds(configIds: string[]) {
  window.localStorage.setItem(
    SELECTED_NOTION_CONFIG_IDS_KEY,
    JSON.stringify(Array.from(new Set(configIds))),
  );
}

export function loadHiddenStatuses() {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(HIDDEN_STATUSES_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    window.localStorage.removeItem(HIDDEN_STATUSES_KEY);
    return [];
  }
}

export function saveHiddenStatuses(statuses: string[]) {
  window.localStorage.setItem(HIDDEN_STATUSES_KEY, JSON.stringify(statuses));
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === "light" || value === "dark";
}

export function loadThemeMode(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(THEME_MODE_KEY);
  return isThemeMode(stored) ? stored : null;
}

export function applyThemeMode(themeMode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = themeMode;
}

export function saveThemeMode(themeMode: ThemeMode) {
  window.localStorage.setItem(THEME_MODE_KEY, themeMode);
  applyThemeMode(themeMode);
}

export function loadShowAllDayTasks() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(SHOW_ALL_DAY_TASKS_KEY) !== "false";
}

export function saveShowAllDayTasks(showAllDayTasks: boolean) {
  window.localStorage.setItem(
    SHOW_ALL_DAY_TASKS_KEY,
    showAllDayTasks ? "true" : "false",
  );
}

export function loadWeekVisibleDays() {
  if (typeof window === "undefined") {
    return DEFAULT_WEEK_VISIBLE_DAYS;
  }

  return clampWeekVisibleDays(
    window.localStorage.getItem(WEEK_VISIBLE_DAYS_KEY),
  );
}

export function saveWeekVisibleDays(weekVisibleDays: number) {
  window.localStorage.setItem(
    WEEK_VISIBLE_DAYS_KEY,
    String(clampWeekVisibleDays(weekVisibleDays)),
  );
}

function isInteractionMode(value: string | null): value is InteractionMode {
  return value === "view" || value === "change";
}

export function loadInteractionMode(): InteractionMode {
  if (typeof window === "undefined") {
    return "view";
  }

  const stored = window.localStorage.getItem(INTERACTION_MODE_KEY);
  return isInteractionMode(stored) ? stored : "view";
}

export function saveInteractionMode(interactionMode: InteractionMode) {
  window.localStorage.setItem(INTERACTION_MODE_KEY, interactionMode);
}

export function loadGoogleCalendarId() {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(GOOGLE_CALENDAR_ID_KEY);
  return stored?.trim() || null;
}

export function saveGoogleCalendarId(calendarId: string) {
  window.localStorage.setItem(GOOGLE_CALENDAR_ID_KEY, calendarId);
}

export function loadGoogleCalendarIds() {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(GOOGLE_CALENDAR_IDS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [];
    } catch {
      window.localStorage.removeItem(GOOGLE_CALENDAR_IDS_KEY);
    }
  }

  const legacyCalendarId = loadGoogleCalendarId();
  return legacyCalendarId ? [legacyCalendarId] : [];
}

export function saveGoogleCalendarIds(calendarIds: string[]) {
  window.localStorage.setItem(
    GOOGLE_CALENDAR_IDS_KEY,
    JSON.stringify(calendarIds),
  );
  if (calendarIds[0]) {
    saveGoogleCalendarId(calendarIds[0]);
  }
}

export function loadGoogleCalendarColors() {
  if (typeof window === "undefined") {
    return {};
  }

  const raw = window.localStorage.getItem(GOOGLE_CALENDAR_COLORS_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" &&
          typeof entry[1] === "string" &&
          /^#[0-9a-f]{6}$/i.test(entry[1]),
      ),
    );
  } catch {
    window.localStorage.removeItem(GOOGLE_CALENDAR_COLORS_KEY);
    return {};
  }
}

export function saveGoogleCalendarColors(colors: Record<string, string>) {
  window.localStorage.setItem(
    GOOGLE_CALENDAR_COLORS_KEY,
    JSON.stringify(colors),
  );
}

import type { AppConfig } from "@/lib/types";

const CONFIG_KEY = "notion-planner-ipad:v1";
const HIDDEN_STATUSES_KEY = "notion-planner-ipad:hidden-statuses:v1";
const THEME_MODE_KEY = "notion-planner-ipad:theme:v1";

export type ThemeMode = "light" | "dark";

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
}

export function clearConfig() {
  window.localStorage.removeItem(CONFIG_KEY);
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

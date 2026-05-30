import type { AppConfig } from "@/lib/types";

const CONFIG_KEY = "notion-planner-ipad:v1";
const HIDDEN_STATUSES_KEY = "notion-planner-ipad:hidden-statuses:v1";

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

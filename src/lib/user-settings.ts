import { createHash } from "crypto";
import type {
  AppConfig,
  GoogleUserProfile,
  NotionProperty,
  PropertyMapping,
  UserSettings,
} from "@/lib/types";
import { clampWeekVisibleDays } from "@/lib/storage";

type UpstashResponse<T> = {
  result?: T;
  error?: string;
};

function upstashConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.KV_REST_API_URL ??
    process.env.VERCEL_KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.KV_REST_API_TOKEN ??
    process.env.VERCEL_KV_REST_API_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { url: url.replace(/\/$/, ""), token };
}

export function userSettingsStorageConfigured() {
  return Boolean(upstashConfig());
}

function userSettingsKey(profile: GoogleUserProfile) {
  const userHash = createHash("sha256").update(profile.sub).digest("hex");
  return `notion-planner-ipad:user-settings:${userHash}`;
}

async function redisCommand<T>(command: unknown[]) {
  const config = upstashConfig();
  if (!config) {
    throw new Error(
      "ユーザー別保存にはUPSTASH_REDIS_REST_URLとUPSTASH_REDIS_REST_TOKENを設定してください。",
    );
  }

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    | UpstashResponse<T>
    | null;

  if (!response.ok || data?.error) {
    throw new Error(data?.error ?? `設定保存DBへ接続できませんでした: ${response.status}`);
  }

  return data?.result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeProperty(value: unknown): NotionProperty | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.id;
  const name = value.name;
  const type = value.type;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof type !== "string"
  ) {
    return null;
  }

  const options = Array.isArray(value.options)
    ? value.options
        .filter(isRecord)
        .map((option) => ({
          id: typeof option.id === "string" ? option.id : undefined,
          name: typeof option.name === "string" ? option.name : "",
          color: typeof option.color === "string" ? option.color : undefined,
        }))
        .filter((option) => option.name)
    : undefined;

  return { id, name, type, options };
}

function sanitizeMapping(value: unknown): PropertyMapping | null {
  if (!isRecord(value)) {
    return null;
  }

  if (typeof value.title !== "string" || typeof value.date !== "string") {
    return null;
  }

  return {
    title: value.title,
    date: value.date,
    status: typeof value.status === "string" ? value.status : undefined,
    memo: typeof value.memo === "string" ? value.memo : undefined,
    tags: typeof value.tags === "string" ? value.tags : undefined,
    url:
      typeof value.url === "string"
        ? value.url
        : Array.isArray(value.url)
          ? stringArray(value.url)
          : undefined,
    files:
      typeof value.files === "string"
        ? value.files
        : Array.isArray(value.files)
          ? stringArray(value.files)
          : undefined,
  };
}

function sanitizeConfig(value: unknown): AppConfig | null {
  if (!isRecord(value) || typeof value.targetId !== "string") {
    return null;
  }

  const properties = Array.isArray(value.properties)
    ? value.properties
        .map(sanitizeProperty)
        .filter((property): property is NotionProperty => property !== null)
    : [];
  const mapping = sanitizeMapping(value.mapping);

  if (!mapping) {
    return null;
  }

  return {
    targetId: value.targetId,
    targetName:
      typeof value.targetName === "string" ? value.targetName : undefined,
    databaseId:
      typeof value.databaseId === "string" ? value.databaseId : undefined,
    dataSourceId:
      typeof value.dataSourceId === "string" ? value.dataSourceId : undefined,
    properties,
    mapping,
  };
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function hexColorMap(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" &&
        typeof entry[1] === "string" &&
        /^#[0-9a-f]{6}$/i.test(entry[1]),
    ),
  );
}

export function sanitizeUserSettings(value: unknown): UserSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const notionConfigs = Array.isArray(value.notionConfigs)
    ? value.notionConfigs
        .map(sanitizeConfig)
        .filter((config): config is AppConfig => config !== null)
    : [];
  const themeMode = value.themeMode === "dark" ? "dark" : "light";
  const interactionMode = value.interactionMode === "change" ? "change" : "view";

  return {
    notionConfigs,
    activeNotionDataSourceId:
      typeof value.activeNotionDataSourceId === "string"
        ? value.activeNotionDataSourceId
        : null,
    selectedNotionDataSourceIds: stringArray(value.selectedNotionDataSourceIds),
    splitAllDayNotionDataSourceIds: stringArray(
      value.splitAllDayNotionDataSourceIds,
    ),
    hiddenStatuses: stringArray(value.hiddenStatuses),
    showAllDayTasks: value.showAllDayTasks !== false,
    weekVisibleDays: clampWeekVisibleDays(value.weekVisibleDays),
    themeMode,
    interactionMode,
    selectedGoogleCalendarIds: stringArray(value.selectedGoogleCalendarIds),
    googleCalendarColors: hexColorMap(value.googleCalendarColors),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

export async function readUserSettings(profile: GoogleUserProfile) {
  const raw = await redisCommand<string | null>([
    "GET",
    userSettingsKey(profile),
  ]);

  if (!raw) {
    return null;
  }

  try {
    return sanitizeUserSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeUserSettings(
  profile: GoogleUserProfile,
  settings: UserSettings,
) {
  const sanitized = sanitizeUserSettings({
    ...settings,
    updatedAt: new Date().toISOString(),
  });

  if (!sanitized) {
    throw new Error("保存する設定の形式が不正です。");
  }

  await redisCommand<"OK">([
    "SET",
    userSettingsKey(profile),
    JSON.stringify(sanitized),
  ]);

  return sanitized;
}

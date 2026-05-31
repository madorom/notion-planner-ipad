"use client";

import { addDays } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, Redo2, Undo2 } from "lucide-react";
import { CalendarHeader } from "@/components/calendar-header";
import { LoginPanel } from "@/components/login-panel";
import { MonthView } from "@/components/month-view";
import { SetupPanel } from "@/components/setup-panel";
import { TaskModal, taskPropertyTypes } from "@/components/task-modal";
import { TaskSummaryPopover } from "@/components/task-summary-popover";
import { WeekView } from "@/components/week-view";
import { getViewRange, startOfPlannerWeek } from "@/lib/calendar";
import {
  clearConfig,
  applyThemeMode,
  appConfigKey,
  loadConfig,
  loadGoogleCalendarColors,
  loadGoogleCalendarIds,
  loadHiddenStatuses,
  loadInteractionMode,
  loadKnownConfigs,
  loadSelectedNotionConfigIds,
  loadShowAllDayTasks,
  loadThemeMode,
  saveConfig,
  saveGoogleCalendarColors,
  saveGoogleCalendarIds,
  saveHiddenStatuses,
  saveInteractionMode,
  saveKnownConfig,
  saveSelectedNotionConfigIds,
  saveShowAllDayTasks,
  saveThemeMode,
  type InteractionMode,
  type ThemeMode,
} from "@/lib/storage";
import type {
  AppConfig,
  GoogleCalendarOption,
  GoogleUserProfile,
  NotionProperty,
  PlannerTask,
  StatusFilterOption,
  TaskInput,
  UserSettings,
} from "@/lib/types";

type ModalState =
  | {
      mode: "create";
      start: Date;
      end: Date;
    }
  | {
      mode: "edit";
      task: PlannerTask;
    }
  | null;

type AuthStatus = "checking" | "authenticated" | "guest";

type GoogleSessionState = {
  configured: boolean;
  connected: boolean;
  user?: GoogleUserProfile | null;
};

type SettingsSyncState = {
  configured: boolean;
  loaded: boolean;
  saving: boolean;
  user?: GoogleUserProfile | null;
};

type TaskHistoryAction =
  | {
      type: "create";
      task: PlannerTask;
    }
  | {
      type: "update";
      before: PlannerTask;
      after: PlannerTask;
    };

const HISTORY_LIMIT = 30;
const WEEK_PREVIEW_DAY_BUFFER = 60;
const FALLBACK_GOOGLE_COLOR = "#4285f4";

function resolveStatusProperty(config: AppConfig | null): NotionProperty | undefined {
  if (!config) {
    return undefined;
  }

  return (
    config.properties.find((property) => property.name === config.mapping.status) ??
    config.properties.find((property) => property.type === "status") ??
    config.properties.find(
      (property) =>
        property.type === "select" &&
        ["ステータス", "status", "Status", "状態"].includes(property.name),
    ) ??
    config.properties.find((property) => property.type === "select")
  );
}

function isHexColor(value: string | undefined): value is string {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
}

function calendarDefaultColor(calendar: GoogleCalendarOption) {
  return isHexColor(calendar.backgroundColor)
    ? calendar.backgroundColor
    : FALLBACK_GOOGLE_COLOR;
}

function configIdentity(config: AppConfig) {
  return appConfigKey(config);
}

function uniqueConfigs(configs: AppConfig[]) {
  const seen = new Set<string>();
  const unique: AppConfig[] = [];

  for (const config of configs) {
    const identity = configIdentity(config);
    if (seen.has(identity)) {
      continue;
    }

    seen.add(identity);
    unique.push(config);
  }

  return unique;
}

function annotateNotionTask(task: PlannerTask, sourceConfig: AppConfig) {
  return {
    ...task,
    source: "notion" as const,
    notionDataSourceId: configIdentity(sourceConfig),
    notionDatabaseName: sourceConfig.targetName,
  };
}

export function PlannerApp() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [knownNotionConfigs, setKnownNotionConfigs] = useState<AppConfig[]>([]);
  const [selectedNotionConfigIds, setSelectedNotionConfigIds] = useState<
    string[]
  >([]);
  const [setupOpen, setSetupOpen] = useState(false);
  const [view, setView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(() =>
    startOfPlannerWeek(new Date()),
  );
  const [displayDate, setDisplayDate] = useState(() =>
    startOfPlannerWeek(new Date()),
  );
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [summaryTask, setSummaryTask] = useState<PlannerTask | null>(null);
  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>([]);
  const [showAllDayTasks, setShowAllDayTasks] = useState(true);
  const [undoStack, setUndoStack] = useState<TaskHistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<TaskHistoryAction[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("view");
  const [googleSession, setGoogleSession] = useState<GoogleSessionState>({
    configured: false,
    connected: false,
    user: null,
  });
  const [settingsSync, setSettingsSync] = useState<SettingsSyncState>({
    configured: false,
    loaded: false,
    saving: false,
    user: null,
  });
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarOption[]>(
    [],
  );
  const [googleCalendarsLoading, setGoogleCalendarsLoading] = useState(false);
  const [selectedGoogleCalendarIds, setSelectedGoogleCalendarIds] = useState<
    string[]
  >(["primary"]);
  const [googleCalendarColors, setGoogleCalendarColors] = useState<
    Record<string, string>
  >({});
  const applyingRemoteSettingsRef = useRef(false);
  const settingsLoadedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const stored = loadConfig();
      const localNotionConfigs = uniqueConfigs([
        ...(stored ? [stored] : []),
        ...loadKnownConfigs(),
      ]);
      const availableConfigIds = new Set(
        localNotionConfigs.map((item) => configIdentity(item)),
      );
      const selectedConfigIds = loadSelectedNotionConfigIds().filter((item) =>
        availableConfigIds.has(item),
      );
      const fallbackSelectedConfigIds =
        selectedConfigIds.length > 0
          ? selectedConfigIds
          : stored
            ? [configIdentity(stored)]
            : localNotionConfigs[0]
              ? [configIdentity(localNotionConfigs[0])]
              : [];
      const nextThemeMode = loadThemeMode() ?? "light";
      setConfig(stored);
      setKnownNotionConfigs(localNotionConfigs);
      setSelectedNotionConfigIds(fallbackSelectedConfigIds);
      if (fallbackSelectedConfigIds.length > 0) {
        saveSelectedNotionConfigIds(fallbackSelectedConfigIds);
      }
      setSetupOpen(!stored);
      setHiddenStatuses(loadHiddenStatuses());
      setShowAllDayTasks(loadShowAllDayTasks());
      setThemeMode(nextThemeMode);
      setInteractionMode(loadInteractionMode());
      setSelectedGoogleCalendarIds(loadGoogleCalendarIds());
      setGoogleCalendarColors(loadGoogleCalendarColors());
      applyThemeMode(nextThemeMode);

      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const data = (await response.json()) as { authenticated?: boolean };

        if (active) {
          setAuthStatus(data.authenticated ? "authenticated" : "guest");
        }
      } catch {
        if (active) {
          setAuthStatus("guest");
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const range = useMemo(() => {
    const nextRange = getViewRange(view, currentDate);

    if (view === "week") {
      return {
        start: addDays(nextRange.start, -WEEK_PREVIEW_DAY_BUFFER),
        end: addDays(nextRange.end, WEEK_PREVIEW_DAY_BUFFER),
      };
    }

    return nextRange;
  }, [view, currentDate]);

  const fetchGoogleSession = useCallback(async () => {
    if (authStatus !== "authenticated") {
      return;
    }

    try {
      const response = await fetch("/api/google/session", { cache: "no-store" });
      const data = (await response.json()) as Partial<GoogleSessionState>;

      if (!response.ok) {
        if (response.status === 401) {
          setAuthStatus("guest");
        }
        return;
      }

      setGoogleSession({
        configured: Boolean(data.configured),
        connected: Boolean(data.connected),
        user: data.user ?? null,
      });
    } catch {
      setGoogleSession({ configured: false, connected: false, user: null });
    }
  }, [authStatus]);

  const fetchGoogleCalendars = useCallback(async () => {
    if (authStatus !== "authenticated" || !googleSession.connected) {
      return;
    }

    setGoogleCalendarsLoading(true);

    try {
      const response = await fetch("/api/google/calendars", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        calendars?: GoogleCalendarOption[];
        connected?: boolean;
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 401) {
          setAuthStatus("guest");
        }
        throw new Error(
          data.error ?? "Googleカレンダー一覧を取得できませんでした。",
        );
      }

      if (data.connected === false) {
        setGoogleSession((current) => ({
          ...current,
          connected: false,
          user: null,
        }));
        setGoogleCalendars([]);
        return;
      }

      const calendars = data.calendars ?? [];
      setGoogleCalendars(calendars);

      setGoogleCalendarColors((current) => {
        const next = { ...current };
        for (const calendar of calendars) {
          if (!isHexColor(next[calendar.id])) {
            next[calendar.id] = calendarDefaultColor(calendar);
          }
        }
        saveGoogleCalendarColors(next);
        return next;
      });

      setSelectedGoogleCalendarIds((current) => {
        const availableIds = new Set(calendars.map((calendar) => calendar.id));
        const validSelected = current.filter((calendarId) =>
          availableIds.has(calendarId),
        );

        if (validSelected.length > 0) {
          saveGoogleCalendarIds(validSelected);
          return validSelected;
        }

        const fallback =
          calendars.find((calendar) => calendar.primary)?.id ??
          calendars[0]?.id ??
          "primary";
        saveGoogleCalendarIds([fallback]);
        return [fallback];
      });
    } catch (calendarError) {
      setError(
        calendarError instanceof Error
          ? calendarError.message
          : "Googleカレンダー一覧を取得できませんでした。",
      );
    } finally {
      setGoogleCalendarsLoading(false);
    }
  }, [authStatus, googleSession.connected]);

  const notionConfigs = useMemo(
    () => uniqueConfigs([...(config ? [config] : []), ...knownNotionConfigs]),
    [config, knownNotionConfigs],
  );

  const notionConfigLookup = useMemo(() => {
    const lookup = new Map<string, AppConfig>();
    for (const item of notionConfigs) {
      lookup.set(configIdentity(item), item);
    }
    return lookup;
  }, [notionConfigs]);

  const selectedNotionConfigs = useMemo(() => {
    const selected = selectedNotionConfigIds
      .map((configId) => notionConfigLookup.get(configId))
      .filter((item): item is AppConfig => Boolean(item));

    if (selected.length > 0) {
      return selected;
    }

    return config ? [config] : [];
  }, [config, notionConfigLookup, selectedNotionConfigIds]);

  const buildCurrentUserSettings = useCallback((): UserSettings => {
    const notionConfigs = uniqueConfigs([
      ...(config ? [config] : []),
      ...knownNotionConfigs,
      ...loadKnownConfigs(),
    ]);
    const availableConfigIds = new Set(
      notionConfigs.map((item) => configIdentity(item)),
    );
    const validSelectedConfigIds = selectedNotionConfigIds.filter((item) =>
      availableConfigIds.has(item),
    );
    const fallbackSelectedConfigIds = config ? [configIdentity(config)] : [];

    return {
      notionConfigs,
      activeNotionDataSourceId: config ? configIdentity(config) : null,
      selectedNotionDataSourceIds:
        validSelectedConfigIds.length > 0
          ? validSelectedConfigIds
          : fallbackSelectedConfigIds,
      hiddenStatuses,
      showAllDayTasks,
      themeMode,
      interactionMode,
      selectedGoogleCalendarIds,
      googleCalendarColors,
    };
  }, [
    config,
    googleCalendarColors,
    hiddenStatuses,
    interactionMode,
    knownNotionConfigs,
    selectedNotionConfigIds,
    selectedGoogleCalendarIds,
    showAllDayTasks,
    themeMode,
  ]);

  const applyUserSettings = useCallback((settings: UserSettings) => {
    applyingRemoteSettingsRef.current = true;

    const notionConfigs = uniqueConfigs(settings.notionConfigs);
    for (const savedConfig of notionConfigs) {
      saveKnownConfig(savedConfig);
    }

    const activeConfig =
      notionConfigs.find(
        (item) => configIdentity(item) === settings.activeNotionDataSourceId,
      ) ??
      notionConfigs[0] ??
      null;
    const availableConfigIds = new Set(
      notionConfigs.map((item) => configIdentity(item)),
    );
    const selectedConfigIds = settings.selectedNotionDataSourceIds.filter(
      (item) => availableConfigIds.has(item),
    );
    const fallbackSelectedConfigIds = activeConfig
      ? [configIdentity(activeConfig)]
      : notionConfigs[0]
        ? [configIdentity(notionConfigs[0])]
        : [];
    const nextSelectedConfigIds =
      selectedConfigIds.length > 0
        ? selectedConfigIds
        : fallbackSelectedConfigIds;

    if (activeConfig) {
      saveConfig(activeConfig);
    } else {
      clearConfig();
    }

    saveHiddenStatuses(settings.hiddenStatuses);
    saveSelectedNotionConfigIds(nextSelectedConfigIds);
    saveShowAllDayTasks(settings.showAllDayTasks);
    saveThemeMode(settings.themeMode);
    saveInteractionMode(settings.interactionMode);
    saveGoogleCalendarIds(settings.selectedGoogleCalendarIds);
    saveGoogleCalendarColors(settings.googleCalendarColors);

    setConfig(activeConfig);
    setKnownNotionConfigs(notionConfigs);
    setSelectedNotionConfigIds(nextSelectedConfigIds);
    setSetupOpen(!activeConfig);
    setHiddenStatuses(settings.hiddenStatuses);
    setShowAllDayTasks(settings.showAllDayTasks);
    setThemeMode(settings.themeMode);
    setInteractionMode(settings.interactionMode);
    setSelectedGoogleCalendarIds(settings.selectedGoogleCalendarIds);
    setGoogleCalendarColors(settings.googleCalendarColors);
    setUndoStack([]);
    setRedoStack([]);
    applyThemeMode(settings.themeMode);

    window.setTimeout(() => {
      applyingRemoteSettingsRef.current = false;
    }, 0);
  }, []);

  const saveRemoteUserSettings = useCallback(
    async (settings = buildCurrentUserSettings()) => {
      if (authStatus !== "authenticated" || !googleSession.connected) {
        return;
      }

      setSettingsSync((current) => ({ ...current, saving: true }));

      try {
        const response = await fetch("/api/user/settings", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ settings }),
        });
        const data = (await response.json()) as {
          configured?: boolean;
          connected?: boolean;
          saved?: boolean;
          user?: GoogleUserProfile | null;
          error?: string;
        };

        if (!response.ok && response.status !== 401) {
          throw new Error(data.error ?? "ユーザー設定を保存できませんでした。");
        }

        setSettingsSync({
          configured: Boolean(data.configured),
          loaded: true,
          saving: false,
          user: data.user ?? googleSession.user ?? null,
        });
      } catch (settingsError) {
        setSettingsSync((current) => ({ ...current, saving: false }));
        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "ユーザー設定を保存できませんでした。",
        );
      }
    },
    [
      authStatus,
      buildCurrentUserSettings,
      googleSession.connected,
      googleSession.user,
    ],
  );

  const googleCalendarIdsForQuery = useMemo(() => {
    if (!googleSession.connected) {
      return [];
    }

    if (googleCalendars.length === 0) {
      return selectedGoogleCalendarIds.length > 0
        ? selectedGoogleCalendarIds
        : ["primary"];
    }

    const availableIds = new Set(googleCalendars.map((calendar) => calendar.id));
    const validSelected = selectedGoogleCalendarIds.filter((calendarId) =>
      availableIds.has(calendarId),
    );

    if (validSelected.length > 0) {
      return validSelected;
    }

    const fallback =
      googleCalendars.find((calendar) => calendar.primary)?.id ??
      googleCalendars[0]?.id ??
      "primary";

    return [fallback];
  }, [googleCalendars, googleSession.connected, selectedGoogleCalendarIds]);

  const googleCalendarColorLookup = useMemo(() => {
    const lookup: Record<string, string> = {};
    for (const calendar of googleCalendars) {
      lookup[calendar.id] =
        googleCalendarColors[calendar.id] ?? calendarDefaultColor(calendar);
    }
    return lookup;
  }, [googleCalendarColors, googleCalendars]);

  const fetchTasks = useCallback(async () => {
    if (selectedNotionConfigs.length === 0 || authStatus !== "authenticated") {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const notionTaskGroups = await Promise.all(
        selectedNotionConfigs.map(async (sourceConfig) => {
          const params = new URLSearchParams({
            targetId: sourceConfig.dataSourceId ?? sourceConfig.targetId,
            from: range.start.toISOString(),
            to: range.end.toISOString(),
            titleProperty: sourceConfig.mapping.title,
            dateProperty: sourceConfig.mapping.date,
          });

          if (sourceConfig.mapping.status) {
            params.set("statusProperty", sourceConfig.mapping.status);
          }
          if (sourceConfig.mapping.memo) {
            params.set("memoProperty", sourceConfig.mapping.memo);
          }
          if (sourceConfig.mapping.tags) {
            params.set("tagsProperty", sourceConfig.mapping.tags);
          }
          if (sourceConfig.mapping.url) {
            params.set("urlProperty", sourceConfig.mapping.url);
          }
          if (sourceConfig.mapping.files) {
            params.set("filesProperty", sourceConfig.mapping.files);
          }

          const response = await fetch(`/api/notion/tasks?${params.toString()}`);
          const data = (await response.json()) as {
            tasks?: PlannerTask[];
            error?: string;
          };

          if (!response.ok) {
            if (response.status === 401) {
              setAuthStatus("guest");
            }
            throw new Error(
              data.error ?? "Notionタスクを取得できませんでした。",
            );
          }

          return (data.tasks ?? []).map((task) =>
            annotateNotionTask(task, sourceConfig),
          );
        }),
      );
      const notionTasks: PlannerTask[] = notionTaskGroups.flat();
      let nextTasks: PlannerTask[] = notionTasks;

      if (googleSession.connected && googleCalendarIdsForQuery.length > 0) {
        const googleParams = new URLSearchParams({
          from: range.start.toISOString(),
          to: range.end.toISOString(),
        });
        for (const calendarId of googleCalendarIdsForQuery) {
          googleParams.append("calendarId", calendarId);
        }
        const googleResponse = await fetch(
          `/api/google/events?${googleParams.toString()}`,
        );
        const googleData = (await googleResponse.json()) as {
          tasks?: PlannerTask[];
          connected?: boolean;
          error?: string;
        };

        if (!googleResponse.ok) {
          throw new Error(
            googleData.error ?? "Google Calendar予定を取得できませんでした。",
          );
        }

        if (googleData.connected === false) {
          setGoogleSession((current) => ({
            ...current,
            connected: false,
            user: null,
          }));
          return;
        }

        nextTasks = [...notionTasks, ...(googleData.tasks ?? [])];
      }

      setTasks(nextTasks);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Notionタスクを取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [
    authStatus,
    googleCalendarIdsForQuery,
    googleSession.connected,
    range.end,
    range.start,
    selectedNotionConfigs,
  ]);

  useEffect(() => {
    void fetchGoogleSession();
  }, [fetchGoogleSession]);

  useEffect(() => {
    if (googleSession.connected) {
      void fetchGoogleCalendars();
      return;
    }

    setGoogleCalendars([]);
    settingsLoadedForUserRef.current = null;
    setSettingsSync({
      configured: false,
      loaded: false,
      saving: false,
      user: null,
    });
  }, [fetchGoogleCalendars, googleSession.connected]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !googleSession.connected) {
      return;
    }

    const userKey = googleSession.user?.sub ?? "connected";
    if (settingsLoadedForUserRef.current === userKey) {
      return;
    }

    settingsLoadedForUserRef.current = userKey;
    let active = true;

    async function fetchUserSettings() {
      try {
        const response = await fetch("/api/user/settings", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          configured?: boolean;
          connected?: boolean;
          user?: GoogleUserProfile | null;
          settings?: UserSettings | null;
          error?: string;
        };

        if (!active) {
          return;
        }

        if (!response.ok && response.status !== 401) {
          throw new Error(data.error ?? "ユーザー設定を取得できませんでした。");
        }

        setSettingsSync({
          configured: Boolean(data.configured),
          loaded: true,
          saving: false,
          user: data.user ?? googleSession.user ?? null,
        });

        if (data.settings) {
          applyUserSettings(data.settings);
          return;
        }

        if (data.configured) {
          void saveRemoteUserSettings(buildCurrentUserSettings());
        }
      } catch (settingsError) {
        if (!active) {
          return;
        }

        setSettingsSync((current) => ({
          ...current,
          loaded: true,
          saving: false,
        }));
        setError(
          settingsError instanceof Error
            ? settingsError.message
            : "ユーザー設定を取得できませんでした。",
        );
      }
    }

    void fetchUserSettings();

    return () => {
      active = false;
    };
  }, [
    applyUserSettings,
    authStatus,
    buildCurrentUserSettings,
    googleSession.connected,
    googleSession.user,
    saveRemoteUserSettings,
  ]);

  useEffect(() => {
    if (
      !settingsSync.loaded ||
      !settingsSync.configured ||
      !googleSession.connected ||
      applyingRemoteSettingsRef.current
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveRemoteUserSettings();
    }, 650);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    config,
    googleCalendarColors,
    googleSession.connected,
    hiddenStatuses,
    interactionMode,
    knownNotionConfigs,
    saveRemoteUserSettings,
    selectedNotionConfigIds,
    selectedGoogleCalendarIds,
    settingsSync.configured,
    settingsSync.loaded,
    showAllDayTasks,
    themeMode,
  ]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const statusOptions = useMemo<StatusFilterOption[]>(() => {
    const counts = new Map<string, { count: number; color?: string }>();

    for (const task of tasks) {
      if (!task.status) {
        continue;
      }

      const current = counts.get(task.status) ?? { count: 0, color: task.statusColor };
      counts.set(task.status, {
        count: current.count + 1,
        color: current.color ?? task.statusColor,
      });
    }

    for (const sourceConfig of selectedNotionConfigs) {
      const statusProperty = resolveStatusProperty(sourceConfig);
      for (const option of statusProperty?.options ?? []) {
        const current = counts.get(option.name) ?? {
          count: 0,
          color: option.color,
        };
        counts.set(option.name, {
          count: current.count,
          color: current.color ?? option.color,
        });
      }
    }

    return Array.from(counts, ([name, value]) => ({
      name,
      color: value.color,
      count: value.count,
    })).sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.name.localeCompare(b.name, "ja");
    });
  }, [selectedNotionConfigs, tasks]);

  const tasksWithCalendarColors = useMemo(
    () =>
      tasks.map((task) => {
        if (task.source !== "google" || !task.googleCalendarId) {
          return task;
        }

        return {
          ...task,
          colorHex:
            googleCalendarColorLookup[task.googleCalendarId] ??
            task.colorHex ??
            FALLBACK_GOOGLE_COLOR,
        };
      }),
    [googleCalendarColorLookup, tasks],
  );

  const statusVisibleTasks = useMemo(() => {
    const hiddenStatusSet = new Set(hiddenStatuses);
    return tasksWithCalendarColors.filter(
      (task) => !task.status || !hiddenStatusSet.has(task.status),
    );
  }, [hiddenStatuses, tasksWithCalendarColors]);

  const visibleTasks = useMemo(
    () =>
      statusVisibleTasks.filter(
        (task) => showAllDayTasks || !task.isAllDay,
      ),
    [showAllDayTasks, statusVisibleTasks],
  );

  function changeDate(date: Date) {
    setCurrentDate(date);
    setDisplayDate(date);
  }

  function toggleStatus(status: string) {
    setHiddenStatuses((current) => {
      const next = current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status];
      saveHiddenStatuses(next);
      return next;
    });
  }

  function showAllStatuses() {
    saveHiddenStatuses([]);
    setHiddenStatuses([]);
  }

  function toggleAllDayTasks() {
    setShowAllDayTasks((current) => {
      const next = !current;
      saveShowAllDayTasks(next);
      return next;
    });
  }

  function toggleThemeMode() {
    setThemeMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      saveThemeMode(next);
      return next;
    });
  }

  function changeInteractionMode(nextMode: InteractionMode) {
    setInteractionMode(nextMode);
    saveInteractionMode(nextMode);

    if (nextMode === "view") {
      setModal(null);
    }
  }

  function changeView(nextView: "week" | "month") {
    setView(nextView);

    if (nextView === "week") {
      setCurrentDate((date) => {
        const next = startOfPlannerWeek(date);
        setDisplayDate(next);
        return next;
      });
    }
  }

  function toggleGoogleCalendar() {
    if (!googleSession.configured) {
      setError(
        "Google Calendar連携には、VercelのEnvironment VariablesにGOOGLE_CLIENT_IDとGOOGLE_CLIENT_SECRETを設定してください。",
      );
      return;
    }

    if (!googleSession.connected) {
      window.location.href = "/api/google/connect";
      return;
    }

    void disconnectGoogleCalendar();
  }

  function toggleGoogleCalendarId(calendarId: string) {
    setSelectedGoogleCalendarIds((current) => {
      const next = current.includes(calendarId)
        ? current.length > 1
          ? current.filter((item) => item !== calendarId)
          : current
        : [...current, calendarId];
      saveGoogleCalendarIds(next);
      return next;
    });
  }

  function changeGoogleCalendarColor(calendarId: string, color: string) {
    if (!isHexColor(color)) {
      return;
    }

    setGoogleCalendarColors((current) => {
      const next = { ...current, [calendarId]: color };
      saveGoogleCalendarColors(next);
      return next;
    });
  }

  function showAllGoogleCalendars() {
    const next = googleCalendars.map((calendar) => calendar.id);
    setSelectedGoogleCalendarIds(next);
    saveGoogleCalendarIds(next);
  }

  function toggleNotionConfig(configId: string) {
    const availableIds = new Set(
      notionConfigs.map((item) => configIdentity(item)),
    );
    const normalized = selectedNotionConfigIds.filter((item) =>
      availableIds.has(item),
    );
    const current =
      normalized.length > 0
        ? normalized
        : config
          ? [configIdentity(config)]
          : [];
    const next = current.includes(configId)
      ? current.length > 1
        ? current.filter((item) => item !== configId)
        : current
      : [...current, configId];

    setSelectedNotionConfigIds(next);
    saveSelectedNotionConfigIds(next);

    if (config && !next.includes(configIdentity(config))) {
      const nextActiveConfig = notionConfigs.find(
        (item) => configIdentity(item) === next[0],
      );
      if (nextActiveConfig) {
        saveConfig(nextActiveConfig);
        setConfig(nextActiveConfig);
      }
    }
  }

  function showAllNotionConfigs() {
    const next = notionConfigs.map((item) => configIdentity(item));
    setSelectedNotionConfigIds(next);
    saveSelectedNotionConfigIds(next);
  }

  async function disconnectGoogleCalendar() {
    setError("");

    try {
      const response = await fetch("/api/google/disconnect", {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? "Google Calendar連携を解除できませんでした。");
      }

      setGoogleSession((current) => ({
        ...current,
        connected: false,
        user: null,
      }));
      setGoogleCalendars([]);
      await fetchTasks();
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Google Calendar連携を解除できませんでした。",
      );
    }
  }

  function pushHistory(action: TaskHistoryAction) {
    setUndoStack((current) => [...current, action].slice(-HISTORY_LIMIT));
    setRedoStack([]);
  }

  function taskInputFromTask(task: PlannerTask, start?: string, end?: string): TaskInput {
    return {
      title: task.title,
      start: start ?? task.start,
      end: end ?? task.end,
      status: task.status,
      memo: task.memo,
      tags: task.tags,
      externalUrl: task.externalUrl,
      attachments: task.attachments,
    };
  }

  async function persistTask(task: TaskInput, existingTask?: PlannerTask) {
    const targetConfig = existingTask?.notionDataSourceId
      ? notionConfigLookup.get(existingTask.notionDataSourceId) ?? config
      : config;

    if (!targetConfig) {
      throw new Error("設定が読み込まれていません。");
    }

    const response = await fetch(
      existingTask
        ? `/api/notion/tasks/${encodeURIComponent(existingTask.id)}`
        : "/api/notion/tasks",
      {
        method: existingTask ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          targetId: targetConfig.dataSourceId ?? targetConfig.targetId,
          mapping: targetConfig.mapping,
          propertyTypes: taskPropertyTypes(targetConfig),
          task,
        }),
      },
    );
    const data = (await response.json()) as {
      task?: PlannerTask;
      error?: string;
    };

    if (!response.ok) {
      if (response.status === 401) {
        setAuthStatus("guest");
      }
      throw new Error(data.error ?? "Notionへ保存できませんでした。");
    }

    return data.task ? annotateNotionTask(data.task, targetConfig) : undefined;
  }

  async function setTaskTrash(task: PlannerTask, inTrash: boolean) {
    const response = await fetch(
      `/api/notion/tasks/${encodeURIComponent(task.id)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ inTrash }),
      },
    );
    const data = (await response.json()) as {
      error?: string;
    };

    if (!response.ok) {
      if (response.status === 401) {
        setAuthStatus("guest");
      }
      throw new Error(
        data.error ??
          (inTrash
            ? "Notionのタスクを取り消せませんでした。"
            : "Notionのタスクを復元できませんでした。"),
      );
    }
  }

  async function saveTask(task: TaskInput, existingTask?: PlannerTask) {
    if (!config || interactionMode !== "change") {
      return;
    }

    setSaving(true);
    setError("");

    try {
      const savedTask = await persistTask(task, existingTask);
      if (savedTask) {
        pushHistory(
          existingTask
            ? {
                type: "update",
                before: existingTask,
                after: savedTask,
              }
            : {
                type: "create",
                task: savedTask,
              },
        );
      }
      setModal(null);
      await fetchTasks();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Notionへ保存できませんでした。",
      );
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(task: PlannerTask, start: Date, end: Date) {
    if (interactionMode !== "change" || task.source === "google") {
      return;
    }

    const originalTasks = tasks;
    const movedTask: PlannerTask = {
      ...task,
      start: start.toISOString(),
      end: end.toISOString(),
      isAllDay: false,
    };

    setTasks((current) =>
      current.map((item) => (item.id === task.id ? movedTask : item)),
    );
    setSaving(true);
    setError("");

    try {
      const savedTask = await persistTask(
        taskInputFromTask(task, movedTask.start, movedTask.end),
        task,
      );
      pushHistory({
        type: "update",
        before: task,
        after: savedTask ?? movedTask,
      });
      await fetchTasks();
    } catch (moveError) {
      setTasks(originalTasks);
      setError(
        moveError instanceof Error
          ? moveError.message
          : "Notionへ保存できませんでした。",
      );
    } finally {
      setSaving(false);
    }
  }

  async function undoLastAction() {
    const action = undoStack.at(-1);
    if (!action || historyBusy) {
      return;
    }

    const originalTasks = tasks;
    setHistoryBusy(true);
    setSaving(true);
    setError("");

    try {
      if (action.type === "create") {
        setTasks((current) =>
          current.filter((item) => item.id !== action.task.id),
        );
        await setTaskTrash(action.task, true);
      } else {
        setTasks((current) =>
          current.map((item) =>
            item.id === action.before.id ? action.before : item,
          ),
        );
        await persistTask(taskInputFromTask(action.before), action.before);
      }
      setUndoStack((current) => current.slice(0, -1));
      setRedoStack((current) => [...current, action].slice(-HISTORY_LIMIT));
      await fetchTasks();
    } catch (historyError) {
      setTasks(originalTasks);
      setError(
        historyError instanceof Error
          ? historyError.message
          : "元に戻せませんでした。",
      );
    } finally {
      setHistoryBusy(false);
      setSaving(false);
    }
  }

  async function redoLastAction() {
    const action = redoStack.at(-1);
    if (!action || historyBusy) {
      return;
    }

    const originalTasks = tasks;
    setHistoryBusy(true);
    setSaving(true);
    setError("");

    try {
      if (action.type === "create") {
        setTasks((current) =>
          current.some((item) => item.id === action.task.id)
            ? current
            : [...current, action.task],
        );
        await setTaskTrash(action.task, false);
      } else {
        setTasks((current) =>
          current.map((item) =>
            item.id === action.after.id ? action.after : item,
          ),
        );
        await persistTask(taskInputFromTask(action.after), action.after);
      }
      setRedoStack((current) => current.slice(0, -1));
      setUndoStack((current) => [...current, action].slice(-HISTORY_LIMIT));
      await fetchTasks();
    } catch (historyError) {
      setTasks(originalTasks);
      setError(
        historyError instanceof Error
          ? historyError.message
          : "やり直しできませんでした。",
      );
    } finally {
      setHistoryBusy(false);
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setTasks([]);
    setError("");
    setGoogleSession({ configured: false, connected: false, user: null });
    setSettingsSync({ configured: false, loaded: false, saving: false, user: null });
    setGoogleCalendars([]);
    setUndoStack([]);
    setRedoStack([]);
    setAuthStatus("guest");
  }

  if (authStatus === "checking") {
    return (
      <main className="flex min-h-dvh items-center justify-center px-5">
        <div className="rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-5 py-4 text-sm font-bold text-[color:var(--planner-soft)] shadow-planner">
          認証状態を確認しています...
        </div>
      </main>
    );
  }

  if (authStatus === "guest") {
    return (
      <LoginPanel
        onAuthenticated={() => {
          setAuthStatus("authenticated");
        }}
      />
    );
  }

  if (setupOpen || !config) {
    return (
      <SetupPanel
        initialConfig={config}
        onReady={(nextConfig) => {
          const nextConfigId = configIdentity(nextConfig);
          setKnownNotionConfigs((current) =>
            uniqueConfigs([nextConfig, ...current, ...loadKnownConfigs()]),
          );
          setSelectedNotionConfigIds((current) => {
            const next = current.includes(nextConfigId)
              ? current
              : [...current, nextConfigId];
            saveSelectedNotionConfigIds(next);
            return next;
          });
          setConfig(nextConfig);
          setSummaryTask(null);
          setUndoStack([]);
          setRedoStack([]);
          setSetupOpen(false);
        }}
      />
    );
  }

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const editable = interactionMode === "change";
  const modalConfig =
    modal?.mode === "edit" && modal.task.notionDataSourceId
      ? notionConfigLookup.get(modal.task.notionDataSourceId) ?? config
      : config;

  function showTaskSummary(task: PlannerTask) {
    setSummaryTask(task);
  }

  function openTaskEditor(task: PlannerTask) {
    if (task.source === "google") {
      return;
    }

    setSummaryTask(null);
    setModal({ mode: "edit", task });
  }

  return (
    <div className="min-h-dvh">
      <CalendarHeader
        view={view}
        currentDate={displayDate}
        loading={loading}
        themeMode={themeMode}
        interactionMode={interactionMode}
        notionConfigs={notionConfigs}
        selectedNotionConfigIds={selectedNotionConfigIds}
        googleConfigured={googleSession.configured}
        googleConnected={googleSession.connected}
        googleCalendars={googleCalendars}
        googleCalendarsLoading={googleCalendarsLoading}
        selectedGoogleCalendarIds={selectedGoogleCalendarIds}
        googleCalendarColors={googleCalendarColors}
        statusOptions={statusOptions}
        hiddenStatuses={hiddenStatuses}
        onViewChange={changeView}
        onDateChange={changeDate}
        onRefresh={fetchTasks}
        onToggleTheme={toggleThemeMode}
        onInteractionModeChange={changeInteractionMode}
        onToggleNotionConfig={toggleNotionConfig}
        onShowAllNotionConfigs={showAllNotionConfigs}
        onToggleGoogleCalendar={toggleGoogleCalendar}
        onToggleGoogleCalendarId={toggleGoogleCalendarId}
        onGoogleCalendarColorChange={changeGoogleCalendarColor}
        onShowAllGoogleCalendars={showAllGoogleCalendars}
        onSettings={() => setSetupOpen(true)}
        onToggleStatus={toggleStatus}
        onShowAllStatuses={showAllStatuses}
        onLogout={logout}
      />

      {error ? (
        <div className="mx-auto max-w-[1500px] px-4 pt-4 md:px-6">
          <div className="flex items-center gap-2 rounded-lg border border-coral-500/30 bg-coral-500/10 px-4 py-3 text-sm font-semibold text-coral-500">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <WeekView
          currentDate={currentDate}
          tasks={statusVisibleTasks}
          editable={editable}
          showAllDayTasks={showAllDayTasks}
          onToggleAllDayTasks={toggleAllDayTasks}
          onCreate={(start, end) => setModal({ mode: "create", start, end })}
          onEdit={showTaskSummary}
          onDateChange={setCurrentDate}
          onVisibleDateChange={setDisplayDate}
          onMoveTask={moveTask}
        />
      ) : (
        <MonthView
          currentDate={currentDate}
          tasks={visibleTasks}
          editable={editable}
          onDateChange={changeDate}
          onCreate={(start, end) => {
            changeDate(start);
            setModal({ mode: "create", start, end });
          }}
          onEdit={showTaskSummary}
        />
      )}

      <div className="fixed bottom-4 right-4 z-40 flex gap-2 md:hidden">
        <button
          type="button"
          onClick={() => {
            clearConfig();
            setConfig(null);
            setUndoStack([]);
            setRedoStack([]);
            setSetupOpen(true);
          }}
          className="min-h-12 rounded-lg bg-ink px-4 text-sm font-bold text-white shadow-planner dark:bg-mint-500"
        >
          設定
        </button>
      </div>

      <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-1.5 shadow-planner">
        <button
          type="button"
          aria-label="元に戻す"
          title="元に戻す"
          onClick={undoLastAction}
          disabled={!editable || !canUndo || historyBusy || saving}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {historyBusy ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <Undo2 className="h-5 w-5" />
          )}
          <span>戻す</span>
        </button>
        <button
          type="button"
          aria-label="次に進む"
          title="次に進む"
          onClick={redoLastAction}
          disabled={!editable || !canRedo || historyBusy || saving}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Redo2 className="h-5 w-5" />
          <span>進む</span>
        </button>
      </div>

      {modal ? (
        <TaskModal
          state={modal}
          config={modalConfig}
          saving={saving}
          readOnly={!editable && modal.mode === "edit"}
          onClose={() => setModal(null)}
          onSave={saveTask}
        />
      ) : null}

      {summaryTask ? (
        <TaskSummaryPopover
          task={summaryTask}
          editable={editable}
          onClose={() => setSummaryTask(null)}
          onEdit={() => openTaskEditor(summaryTask)}
        />
      ) : null}
    </div>
  );
}

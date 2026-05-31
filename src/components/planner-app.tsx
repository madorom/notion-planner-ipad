"use client";

import { addDays } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, LoaderCircle, Redo2, Undo2 } from "lucide-react";
import { CalendarHeader } from "@/components/calendar-header";
import { LoginPanel } from "@/components/login-panel";
import { MonthView } from "@/components/month-view";
import { SetupPanel } from "@/components/setup-panel";
import { TaskModal, taskPropertyTypes } from "@/components/task-modal";
import { WeekView } from "@/components/week-view";
import { getViewRange } from "@/lib/calendar";
import {
  clearConfig,
  applyThemeMode,
  loadConfig,
  loadGoogleCalendarId,
  loadHiddenStatuses,
  loadThemeMode,
  saveGoogleCalendarId,
  saveHiddenStatuses,
  saveThemeMode,
  type ThemeMode,
} from "@/lib/storage";
import type {
  AppConfig,
  GoogleCalendarOption,
  NotionProperty,
  PlannerTask,
  StatusFilterOption,
  TaskInput,
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
const WEEK_PREVIEW_DAY_BUFFER = 1;

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

export function PlannerApp() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [view, setView] = useState<"week" | "month">("week");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [hiddenStatuses, setHiddenStatuses] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<TaskHistoryAction[]>([]);
  const [redoStack, setRedoStack] = useState<TaskHistoryAction[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [googleSession, setGoogleSession] = useState<GoogleSessionState>({
    configured: false,
    connected: false,
  });
  const [googleCalendars, setGoogleCalendars] = useState<GoogleCalendarOption[]>(
    [],
  );
  const [googleCalendarsLoading, setGoogleCalendarsLoading] = useState(false);
  const [selectedGoogleCalendarId, setSelectedGoogleCalendarId] =
    useState("primary");

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const stored = loadConfig();
      const nextThemeMode = loadThemeMode() ?? "light";
      setConfig(stored);
      setSetupOpen(!stored);
      setHiddenStatuses(loadHiddenStatuses());
      setThemeMode(nextThemeMode);
      setSelectedGoogleCalendarId(loadGoogleCalendarId() ?? "primary");
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
      });
    } catch {
      setGoogleSession({ configured: false, connected: false });
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
        setGoogleSession((current) => ({ ...current, connected: false }));
        setGoogleCalendars([]);
        return;
      }

      const calendars = data.calendars ?? [];
      setGoogleCalendars(calendars);

      setSelectedGoogleCalendarId((current) => {
        if (calendars.some((calendar) => calendar.id === current)) {
          return current;
        }

        const fallback =
          calendars.find((calendar) => calendar.primary)?.id ??
          calendars[0]?.id ??
          "primary";
        saveGoogleCalendarId(fallback);
        return fallback;
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

  const googleCalendarIdForQuery = useMemo(() => {
    if (!googleSession.connected) {
      return "primary";
    }

    if (googleCalendars.length === 0) {
      return "primary";
    }

    if (
      googleCalendars.some(
        (calendar) => calendar.id === selectedGoogleCalendarId,
      )
    ) {
      return selectedGoogleCalendarId;
    }

    return (
      googleCalendars.find((calendar) => calendar.primary)?.id ??
      googleCalendars[0]?.id ??
      "primary"
    );
  }, [googleCalendars, googleSession.connected, selectedGoogleCalendarId]);

  const fetchTasks = useCallback(async () => {
    if (!config || authStatus !== "authenticated") {
      return;
    }

    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      targetId: config.dataSourceId ?? config.targetId,
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      titleProperty: config.mapping.title,
      dateProperty: config.mapping.date,
    });

    if (config.mapping.status) {
      params.set("statusProperty", config.mapping.status);
    }
    if (config.mapping.memo) {
      params.set("memoProperty", config.mapping.memo);
    }
    if (config.mapping.tags) {
      params.set("tagsProperty", config.mapping.tags);
    }

    try {
      const response = await fetch(`/api/notion/tasks?${params.toString()}`);
      const data = (await response.json()) as {
        tasks?: PlannerTask[];
        error?: string;
      };

      if (!response.ok) {
        if (response.status === 401) {
          setAuthStatus("guest");
        }
        throw new Error(data.error ?? "Notionタスクを取得できませんでした。");
      }

      setTasks(data.tasks ?? []);

      if (googleSession.connected) {
        const googleParams = new URLSearchParams({
          from: range.start.toISOString(),
          to: range.end.toISOString(),
        });
        googleParams.set("calendarId", googleCalendarIdForQuery);
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
          setGoogleSession((current) => ({ ...current, connected: false }));
          return;
        }

        setTasks([...(data.tasks ?? []), ...(googleData.tasks ?? [])]);
      }
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
    config,
    googleCalendarIdForQuery,
    googleSession.connected,
    range.end,
    range.start,
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
  }, [fetchGoogleCalendars, googleSession.connected]);

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

    const statusProperty = resolveStatusProperty(config);
    for (const option of statusProperty?.options ?? []) {
      const current = counts.get(option.name) ?? { count: 0, color: option.color };
      counts.set(option.name, {
        count: current.count,
        color: current.color ?? option.color,
      });
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
  }, [config, tasks]);

  const visibleTasks = useMemo(() => {
    const hiddenStatusSet = new Set(hiddenStatuses);
    return tasks.filter((task) => !task.status || !hiddenStatusSet.has(task.status));
  }, [hiddenStatuses, tasks]);

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

  function toggleThemeMode() {
    setThemeMode((current) => {
      const next = current === "dark" ? "light" : "dark";
      saveThemeMode(next);
      return next;
    });
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

  function changeGoogleCalendar(calendarId: string) {
    setSelectedGoogleCalendarId(calendarId);
    saveGoogleCalendarId(calendarId);
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

      setGoogleSession((current) => ({ ...current, connected: false }));
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
    };
  }

  async function persistTask(task: TaskInput, existingTask?: PlannerTask) {
    if (!config) {
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
          targetId: config.dataSourceId ?? config.targetId,
          mapping: config.mapping,
          propertyTypes: taskPropertyTypes(config),
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

    return data.task;
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
    if (!config) {
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
    if (task.source === "google") {
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
    setGoogleSession({ configured: false, connected: false });
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
          setConfig(nextConfig);
          setUndoStack([]);
          setRedoStack([]);
          setSetupOpen(false);
        }}
      />
    );
  }

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  function openTask(task: PlannerTask) {
    if (task.source === "google") {
      if (task.url) {
        window.open(task.url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    setModal({ mode: "edit", task });
  }

  return (
    <div className="min-h-dvh">
      <CalendarHeader
        view={view}
        currentDate={currentDate}
        loading={loading}
        themeMode={themeMode}
        googleConfigured={googleSession.configured}
        googleConnected={googleSession.connected}
        googleCalendars={googleCalendars}
        googleCalendarsLoading={googleCalendarsLoading}
        selectedGoogleCalendarId={selectedGoogleCalendarId}
        statusOptions={statusOptions}
        hiddenStatuses={hiddenStatuses}
        onViewChange={setView}
        onDateChange={setCurrentDate}
        onRefresh={fetchTasks}
        onToggleTheme={toggleThemeMode}
        onToggleGoogleCalendar={toggleGoogleCalendar}
        onGoogleCalendarChange={changeGoogleCalendar}
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
          tasks={visibleTasks}
          onCreate={(start, end) => setModal({ mode: "create", start, end })}
          onEdit={openTask}
          onDateChange={setCurrentDate}
          onMoveTask={moveTask}
        />
      ) : (
        <MonthView
          currentDate={currentDate}
          tasks={visibleTasks}
          onDateChange={setCurrentDate}
          onCreate={(start, end) => {
            setCurrentDate(start);
            setModal({ mode: "create", start, end });
          }}
          onEdit={openTask}
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
          disabled={!canUndo || historyBusy || saving}
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
          disabled={!canRedo || historyBusy || saving}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Redo2 className="h-5 w-5" />
          <span>進む</span>
        </button>
      </div>

      {modal ? (
        <TaskModal
          state={modal}
          config={config}
          saving={saving}
          onClose={() => setModal(null)}
          onSave={saveTask}
        />
      ) : null}
    </div>
  );
}

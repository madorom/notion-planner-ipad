"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RotateCcw, X } from "lucide-react";
import { CalendarHeader } from "@/components/calendar-header";
import { LoginPanel } from "@/components/login-panel";
import { MonthView } from "@/components/month-view";
import { SetupPanel } from "@/components/setup-panel";
import { TaskModal, taskPropertyTypes } from "@/components/task-modal";
import { WeekView } from "@/components/week-view";
import { getViewRange } from "@/lib/calendar";
import {
  clearConfig,
  loadConfig,
  loadHiddenStatuses,
  saveHiddenStatuses,
} from "@/lib/storage";
import type {
  AppConfig,
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

type MoveUndoState = {
  previousTask: PlannerTask;
  movedTask: PlannerTask;
};

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
  const [moveUndo, setMoveUndo] = useState<MoveUndoState | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const stored = loadConfig();
      setConfig(stored);
      setSetupOpen(!stored);
      setHiddenStatuses(loadHiddenStatuses());

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

  const range = useMemo(() => getViewRange(view, currentDate), [view, currentDate]);

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
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Notionタスクを取得できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [authStatus, config, range.end, range.start]);

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

  async function saveTask(task: TaskInput, existingTask?: PlannerTask) {
    if (!config) {
      return;
    }

    setSaving(true);
    setError("");

    try {
      await persistTask(task, existingTask);
      setMoveUndo(null);
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
      await persistTask(
        taskInputFromTask(task, movedTask.start, movedTask.end),
        task,
      );
      setMoveUndo({
        previousTask: task,
        movedTask,
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

  async function undoLastMove() {
    if (!moveUndo) {
      return;
    }

    const undoState = moveUndo;
    const originalTasks = tasks;
    setMoveUndo(null);
    setTasks((current) =>
      current.map((item) =>
        item.id === undoState.previousTask.id ? undoState.previousTask : item,
      ),
    );
    setSaving(true);
    setError("");

    try {
      await persistTask(taskInputFromTask(undoState.previousTask), undoState.previousTask);
      await fetchTasks();
    } catch (undoError) {
      setTasks(originalTasks);
      setMoveUndo(undoState);
      setError(
        undoError instanceof Error
          ? undoError.message
          : "元の位置へ戻せませんでした。",
      );
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setTasks([]);
    setError("");
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
          setSetupOpen(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-dvh">
      <CalendarHeader
        view={view}
        currentDate={currentDate}
        loading={loading}
        statusOptions={statusOptions}
        hiddenStatuses={hiddenStatuses}
        onViewChange={setView}
        onDateChange={setCurrentDate}
        onRefresh={fetchTasks}
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
          onEdit={(task) => setModal({ mode: "edit", task })}
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
          onEdit={(task) => setModal({ mode: "edit", task })}
        />
      )}

      <div className="fixed bottom-4 right-4 z-40 flex gap-2 md:hidden">
        <button
          type="button"
          onClick={() => {
            clearConfig();
            setConfig(null);
            setSetupOpen(true);
          }}
          className="min-h-12 rounded-lg bg-ink px-4 text-sm font-bold text-white shadow-planner dark:bg-mint-500"
        >
          設定
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

      {moveUndo ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 items-center gap-3 rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 py-3 shadow-planner">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {moveUndo.movedTask.title}
            </p>
            <p className="text-xs font-semibold text-[color:var(--planner-soft)]">
              移動しました
            </p>
          </div>
          <button
            type="button"
            onClick={undoLastMove}
            disabled={saving}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-ink px-3 text-sm font-bold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-mint-500"
          >
            <RotateCcw className="h-4 w-4" />
            元に戻す
          </button>
          <button
            type="button"
            aria-label="元に戻す通知を閉じる"
            onClick={() => setMoveUndo(null)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--planner-border)] text-[color:var(--planner-soft)] transition active:scale-[0.98]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

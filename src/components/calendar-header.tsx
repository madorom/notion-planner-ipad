"use client";

import { addDays, addMonths } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  CalendarCheck,
  CalendarDays,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Filter,
  LogOut,
  Menu,
  Moon,
  PanelLeftOpen,
  PencilLine,
  RefreshCw,
  Settings,
  Sun,
} from "lucide-react";
import { formatDateLabel, startOfPlannerWeek } from "@/lib/calendar";
import { IconButton } from "@/components/icon-button";
import { appConfigKey } from "@/lib/storage";
import type { InteractionMode, ThemeMode } from "@/lib/storage";
import type {
  AppConfig,
  GoogleCalendarOption,
  StatusFilterOption,
} from "@/lib/types";
import { cx, shortId } from "@/lib/utils";

type CalendarHeaderProps = {
  view: "week" | "month";
  currentDate: Date;
  loading: boolean;
  themeMode: ThemeMode;
  interactionMode: InteractionMode;
  weekVisibleDays: number;
  notionConfigs: AppConfig[];
  selectedNotionConfigIds: string[];
  googleConfigured: boolean;
  googleConnected: boolean;
  googleCalendars: GoogleCalendarOption[];
  googleCalendarsLoading: boolean;
  selectedGoogleCalendarIds: string[];
  googleCalendarColors: Record<string, string>;
  statusOptions: StatusFilterOption[];
  hiddenStatuses: string[];
  onViewChange: (view: "week" | "month") => void;
  onDateChange: (date: Date) => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onWeekVisibleDaysChange: (dayCount: number) => void;
  onToggleNotionConfig: (configId: string) => void;
  onShowAllNotionConfigs: () => void;
  onToggleGoogleCalendar: () => void;
  onToggleGoogleCalendarId: (calendarId: string) => void;
  onGoogleCalendarColorChange: (calendarId: string, color: string) => void;
  onShowAllGoogleCalendars: () => void;
  onSettings: () => void;
  onToggleStatus: (status: string) => void;
  onShowAllStatuses: () => void;
  onLogout: () => void;
};

function filterColorClass(color?: string) {
  switch (color) {
    case "blue":
      return "bg-sky-500";
    case "green":
      return "bg-emerald-500";
    case "red":
      return "bg-rose-500";
    case "pink":
      return "bg-pink-500";
    case "purple":
      return "bg-violet-500";
    case "yellow":
      return "bg-amber-400";
    case "orange":
    case "brown":
      return "bg-orange-500";
    case "gray":
      return "bg-slate-500";
    default:
      return "bg-stone-500";
  }
}

function safeHexColor(color: string | undefined) {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : "#4285f4";
}

export function CalendarHeader({
  view,
  currentDate,
  loading,
  themeMode,
  interactionMode,
  weekVisibleDays,
  notionConfigs,
  selectedNotionConfigIds,
  googleConfigured,
  googleConnected,
  googleCalendars,
  googleCalendarsLoading,
  selectedGoogleCalendarIds,
  googleCalendarColors,
  statusOptions,
  hiddenStatuses,
  onViewChange,
  onDateChange,
  onRefresh,
  onToggleTheme,
  onInteractionModeChange,
  onWeekVisibleDaysChange,
  onToggleNotionConfig,
  onShowAllNotionConfigs,
  onToggleGoogleCalendar,
  onToggleGoogleCalendarId,
  onGoogleCalendarColorChange,
  onShowAllGoogleCalendars,
  onSettings,
  onToggleStatus,
  onShowAllStatuses,
  onLogout,
}: CalendarHeaderProps) {
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const previousLabel = view === "week" ? "前の日" : "前の月";
  const nextLabel = view === "week" ? "次の日" : "次の月";
  const hiddenStatusSet = new Set(hiddenStatuses);
  const activeFilterCount = hiddenStatuses.length;
  const selectedNotionConfigSet = new Set(selectedNotionConfigIds);
  const selectedNotionConfigCount = notionConfigs.filter((item) =>
    selectedNotionConfigSet.has(appConfigKey(item)),
  ).length;
  const hiddenNotionConfigCount = Math.max(
    0,
    notionConfigs.length - selectedNotionConfigCount,
  );
  const activeMenuCount = activeFilterCount + hiddenNotionConfigCount;
  const themeLabel =
    themeMode === "dark" ? "ホワイトモード" : "ダークモード";
  const googleLabel = !googleConfigured
    ? "Google Calendar未設定"
    : googleConnected
      ? "Google Calendar解除"
      : "Google Calendar接続";
  const selectedGoogleCalendarSet = new Set(selectedGoogleCalendarIds);
  const selectedGoogleCalendars = googleCalendars.filter((calendar) =>
    selectedGoogleCalendarSet.has(calendar.id),
  );

  useEffect(() => {
    if (!actionsMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (
        actionsMenuRef.current &&
        event.target instanceof Node &&
        !actionsMenuRef.current.contains(event.target)
      ) {
        setActionsMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActionsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionsMenuOpen]);

  function shiftDate(amount: -1 | 1) {
    onDateChange(
      view === "week"
        ? addDays(currentDate, amount)
        : addMonths(currentDate, amount),
    );
  }

  function goToday() {
    onDateChange(view === "week" ? startOfPlannerWeek(new Date()) : new Date());
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--planner-border)] bg-[color:var(--planner-bg)]/92 px-3 py-2 backdrop-blur md:px-6 md:py-3">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 md:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 md:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-white shadow-planner-soft md:h-12 md:w-12">
            <CalendarDays className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <div className="min-w-0">
            <p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--planner-soft)] sm:block">
              Notion Planner
            </p>
            <h1 className="truncate text-lg font-bold leading-tight sm:text-2xl md:text-3xl">
              {formatDateLabel(view, currentDate, weekVisibleDays)}
            </h1>
          </div>
        </div>

        <div className="order-3 grid w-full gap-2 md:order-none md:flex md:w-auto md:items-center md:gap-3">
          <div className="grid grid-cols-[44px_minmax(64px,1fr)_44px] gap-1.5 md:flex md:items-center md:gap-2">
            <IconButton
              label={previousLabel}
              onClick={() => shiftDate(-1)}
              className="px-2 md:px-3"
            >
              <ChevronLeft className="h-5 w-5" />
            </IconButton>
            <IconButton label="今日" onClick={goToday}>
              <PanelLeftOpen className="mr-1.5 h-5 w-5 md:mr-2" />
              <span>今日</span>
            </IconButton>
            <IconButton
              label={nextLabel}
              onClick={() => shiftDate(1)}
              className="px-2 md:px-3"
            >
              <ChevronRight className="h-5 w-5" />
            </IconButton>
          </div>

          <div className="grid gap-2 sm:grid-cols-[auto_auto] md:flex md:items-center">
            <div className="grid w-[96px] grid-cols-2 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-1 shadow-sm">
              <button
                type="button"
                aria-label="閲覧モード"
                title="閲覧モード"
                aria-pressed={interactionMode === "view"}
                onClick={() => onInteractionModeChange("view")}
                className={`inline-flex min-h-10 items-center justify-center rounded-md px-0 text-sm font-bold transition ${
                  interactionMode === "view"
                    ? "bg-ink text-white dark:bg-mint-500"
                    : ""
                }`}
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="変更モード"
                title="変更モード"
                aria-pressed={interactionMode === "change"}
                onClick={() => onInteractionModeChange("change")}
                className={`inline-flex min-h-10 items-center justify-center rounded-md px-0 text-sm font-bold transition ${
                  interactionMode === "change"
                    ? "bg-coral-500 text-white"
                    : ""
                }`}
              >
                <PencilLine className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-1 shadow-sm">
              <button
                type="button"
                onClick={() => onViewChange("week")}
                className={`min-h-10 rounded-md px-3 text-sm font-bold transition sm:px-5 ${
                  view === "week" ? "bg-ink text-white dark:bg-mint-500" : ""
                }`}
              >
                週
              </button>
              <button
                type="button"
                onClick={() => onViewChange("month")}
                className={`min-h-10 rounded-md px-3 text-sm font-bold transition sm:px-5 ${
                  view === "month" ? "bg-ink text-white dark:bg-mint-500" : ""
                }`}
              >
                月
              </button>
            </div>
          </div>
        </div>

        <div className="order-2 flex shrink-0 items-center gap-1.5 md:order-none md:gap-2">
          <IconButton
            label="再読み込み"
            onClick={onRefresh}
            disabled={loading}
            className="px-2 md:px-3"
          >
            <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
          </IconButton>
          <IconButton label="設定" onClick={onSettings} className="px-2 md:px-3">
            <Settings className="h-5 w-5" />
          </IconButton>
          <div ref={actionsMenuRef} className="relative">
            <IconButton
              label="メニュー"
              active={activeMenuCount > 0 || googleConnected}
              className="gap-2 px-2 md:px-3"
              onClick={() => setActionsMenuOpen((open) => !open)}
            >
              <Menu className="h-5 w-5" />
              {activeMenuCount > 0 ? (
                <span className="rounded-full bg-white/25 px-1.5 text-xs">
                  {activeMenuCount}
                </span>
              ) : null}
            </IconButton>
            <div
              className={cx(
                "fixed left-3 right-3 top-[96px] z-50 max-h-[calc(100dvh-112px)] overflow-y-auto rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-3 shadow-planner transition planner-scroll md:absolute md:left-auto md:right-0 md:top-[calc(100%+8px)] md:w-[min(92vw,420px)]",
                actionsMenuOpen
                  ? "visible opacity-100"
                  : "invisible pointer-events-none opacity-0",
              )}
            >
                <div className="grid gap-2 border-b border-[color:var(--planner-border)] pb-3">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleTheme();
                      setActionsMenuOpen(false);
                    }}
                    className="flex min-h-11 items-center gap-3 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] px-3 text-left text-sm font-bold transition active:scale-[0.99]"
                  >
                    {themeMode === "dark" ? (
                      <Sun className="h-5 w-5 text-amber-500" />
                    ) : (
                      <Moon className="h-5 w-5 text-sky-500" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{themeLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleGoogleCalendar();
                      setActionsMenuOpen(false);
                    }}
                    className={cx(
                      "flex min-h-11 items-center gap-3 rounded-lg border px-3 text-left text-sm font-bold transition active:scale-[0.99]",
                      googleConnected
                        ? "border-mint-500/40 bg-mint-500/10"
                        : "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]",
                    )}
                  >
                    {googleConnected ? (
                      <CalendarX className="h-5 w-5 text-mint-600" />
                    ) : (
                      <CalendarCheck className="h-5 w-5 text-mint-600" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{googleLabel}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionsMenuOpen(false);
                      onLogout();
                    }}
                    className="flex min-h-11 items-center gap-3 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] px-3 text-left text-sm font-bold text-coral-500 transition active:scale-[0.99]"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="min-w-0 flex-1 truncate">ログアウト</span>
                  </button>
                </div>

                <div className="border-b border-[color:var(--planner-border)] py-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <CalendarDays className="h-4 w-4" />
                      表示日数
                    </p>
                    <span className="text-xs font-bold text-[color:var(--planner-soft)]">
                      {weekVisibleDays}日
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {Array.from({ length: 7 }, (_, index) => index + 1).map(
                      (dayCount) => (
                        <button
                          key={dayCount}
                          type="button"
                          aria-pressed={weekVisibleDays === dayCount}
                          onClick={() => onWeekVisibleDaysChange(dayCount)}
                          className={cx(
                            "min-h-10 rounded-lg border text-sm font-bold transition active:scale-[0.98]",
                            weekVisibleDays === dayCount
                              ? "border-mint-500 bg-mint-500 text-white"
                              : "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]",
                          )}
                        >
                          {dayCount}
                        </button>
                      ),
                    )}
                  </div>
                </div>

                {notionConfigs.length > 0 ? (
                  <div className="border-b border-[color:var(--planner-border)] py-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-sm font-bold">
                        <Database className="h-4 w-4" />
                        Notion DB
                        <span className="text-xs text-[color:var(--planner-soft)]">
                          {selectedNotionConfigCount}件
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={onShowAllNotionConfigs}
                        disabled={
                          notionConfigs.length === 0 ||
                          selectedNotionConfigCount === notionConfigs.length
                        }
                        className="min-h-9 rounded-lg px-3 text-xs font-bold text-mint-600 disabled:opacity-45"
                      >
                        すべて表示
                      </button>
                    </div>
                    <div className="grid max-h-[30dvh] gap-2 overflow-auto planner-scroll">
                      {notionConfigs.map((notionConfig) => {
                        const configId = appConfigKey(notionConfig);
                        const checked = selectedNotionConfigSet.has(configId);

                        return (
                          <label
                            key={configId}
                            className={cx(
                              "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 transition",
                              checked
                                ? "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]"
                                : "border-transparent opacity-55",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={
                                checked && selectedNotionConfigCount === 1
                              }
                              onChange={() => onToggleNotionConfig(configId)}
                              className="h-5 w-5 shrink-0 accent-mint-500 disabled:opacity-45"
                            />
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className="truncate text-sm font-semibold">
                                {notionConfig.targetName ?? "Notion database"}
                              </span>
                              <span className="font-mono text-xs text-[color:var(--planner-soft)]">
                                {shortId(configId)}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {googleConnected ? (
                  <div className="border-b border-[color:var(--planner-border)] py-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="flex items-center gap-2 text-sm font-bold">
                        <CalendarCheck className="h-4 w-4" />
                        Googleカレンダー
                        <span className="text-xs text-[color:var(--planner-soft)]">
                          {selectedGoogleCalendars.length}件
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={onShowAllGoogleCalendars}
                        disabled={googleCalendars.length === 0}
                        className="min-h-9 rounded-lg px-3 text-xs font-bold text-mint-600 disabled:opacity-45"
                      >
                        すべて表示
                      </button>
                    </div>
                    <div className="grid max-h-[34dvh] gap-2 overflow-auto planner-scroll">
                      {googleCalendarsLoading ? (
                        <p className="rounded-lg bg-[color:var(--planner-surface-muted)] px-3 py-2 text-sm text-[color:var(--planner-soft)]">
                          読み込み中
                        </p>
                      ) : googleCalendars.length > 0 ? (
                        googleCalendars.map((calendar) => {
                          const checked = selectedGoogleCalendarSet.has(
                            calendar.id,
                          );
                          const color = safeHexColor(
                            googleCalendarColors[calendar.id] ??
                              calendar.backgroundColor,
                          );

                          return (
                            <div
                              key={calendar.id}
                              className={cx(
                                "flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2 transition",
                                checked
                                  ? "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]"
                                  : "border-transparent opacity-55",
                              )}
                            >
                              <label className="flex min-w-0 flex-1 items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={
                                    checked &&
                                    selectedGoogleCalendarIds.length === 1
                                  }
                                  onChange={() =>
                                    onToggleGoogleCalendarId(calendar.id)
                                  }
                                  className="h-5 w-5 shrink-0 accent-mint-500 disabled:opacity-45"
                                />
                                <span
                                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: color }}
                                />
                                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                                  {calendar.summary}
                                  {calendar.primary ? "（メイン）" : ""}
                                </span>
                              </label>
                              <input
                                type="color"
                                value={color}
                                onChange={(event) =>
                                  onGoogleCalendarColorChange(
                                    calendar.id,
                                    event.target.value,
                                  )
                                }
                                aria-label={`${calendar.summary}の色`}
                                className="h-9 w-11 shrink-0 cursor-pointer rounded-md border border-[color:var(--planner-border)] bg-transparent p-1"
                              />
                            </div>
                          );
                        })
                      ) : (
                        <p className="rounded-lg bg-[color:var(--planner-surface-muted)] px-3 py-2 text-sm text-[color:var(--planner-soft)]">
                          カレンダーなし
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="pt-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <Filter className="h-4 w-4" />
                      ステータス
                    </p>
                    <button
                      type="button"
                      onClick={onShowAllStatuses}
                      className="min-h-9 rounded-lg px-3 text-xs font-bold text-mint-600"
                    >
                      すべて表示
                    </button>
                  </div>
                  <div className="grid max-h-[42dvh] gap-2 overflow-auto planner-scroll">
                    {statusOptions.length > 0 ? (
                      statusOptions.map((option) => {
                        const visible = !hiddenStatusSet.has(option.name);

                        return (
                          <button
                            key={option.name}
                            type="button"
                            onClick={() => onToggleStatus(option.name)}
                            className={cx(
                              "flex min-h-11 items-center gap-3 rounded-lg border px-3 text-left transition active:scale-[0.99]",
                              visible
                                ? "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]"
                                : "border-transparent opacity-45",
                            )}
                          >
                            <span
                              className={cx(
                                "h-3 w-3 shrink-0 rounded-full",
                                filterColorClass(option.color),
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {option.name}
                            </span>
                            <span className="rounded-full bg-[color:var(--planner-surface)] px-2 py-0.5 text-xs font-bold text-[color:var(--planner-soft)]">
                              {option.count}
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="rounded-lg bg-[color:var(--planner-surface-muted)] px-3 py-2 text-sm text-[color:var(--planner-soft)]">
                        ステータスなし
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
    </header>
  );
}

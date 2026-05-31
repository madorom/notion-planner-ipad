"use client";

import { addDays, addMonths } from "date-fns";
import {
  CalendarCheck,
  CalendarDays,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Filter,
  LogOut,
  Moon,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Sun,
} from "lucide-react";
import { formatDateLabel } from "@/lib/calendar";
import { IconButton } from "@/components/icon-button";
import type { ThemeMode } from "@/lib/storage";
import type { GoogleCalendarOption, StatusFilterOption } from "@/lib/types";
import { cx } from "@/lib/utils";

type CalendarHeaderProps = {
  view: "week" | "month";
  currentDate: Date;
  loading: boolean;
  themeMode: ThemeMode;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleCalendars: GoogleCalendarOption[];
  googleCalendarsLoading: boolean;
  selectedGoogleCalendarId: string;
  statusOptions: StatusFilterOption[];
  hiddenStatuses: string[];
  onViewChange: (view: "week" | "month") => void;
  onDateChange: (date: Date) => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
  onToggleGoogleCalendar: () => void;
  onGoogleCalendarChange: (calendarId: string) => void;
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

export function CalendarHeader({
  view,
  currentDate,
  loading,
  themeMode,
  googleConfigured,
  googleConnected,
  googleCalendars,
  googleCalendarsLoading,
  selectedGoogleCalendarId,
  statusOptions,
  hiddenStatuses,
  onViewChange,
  onDateChange,
  onRefresh,
  onToggleTheme,
  onToggleGoogleCalendar,
  onGoogleCalendarChange,
  onSettings,
  onToggleStatus,
  onShowAllStatuses,
  onLogout,
}: CalendarHeaderProps) {
  const step = view === "week" ? addDays : addMonths;
  const previousLabel = view === "week" ? "前日" : "前の月";
  const nextLabel = view === "week" ? "翌日" : "次の月";
  const hiddenStatusSet = new Set(hiddenStatuses);
  const activeFilterCount = hiddenStatuses.length;
  const themeLabel =
    themeMode === "dark" ? "ホワイトモード" : "ダークモード";
  const googleLabel = !googleConfigured
    ? "Google Calendar未設定"
    : googleConnected
      ? "Google Calendar解除"
      : "Google Calendar接続";
  const selectedCalendarInList = googleCalendars.some(
    (calendar) => calendar.id === selectedGoogleCalendarId,
  );

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--planner-border)] bg-[color:var(--planner-bg)]/92 px-3 py-2 backdrop-blur md:px-6 md:py-3">
      <div className="mx-auto grid max-w-[1500px] gap-2 md:flex md:flex-wrap md:items-center md:gap-3">
        <div className="flex min-w-0 items-center justify-between gap-2 md:flex-1">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-white shadow-planner-soft md:h-12 md:w-12">
              <CalendarDays className="h-5 w-5 md:h-6 md:w-6" />
            </div>
            <div className="min-w-0">
              <p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--planner-soft)] sm:block">
                Notion Planner
              </p>
              <h1 className="truncate text-lg font-bold leading-tight sm:text-2xl md:text-3xl">
                {formatDateLabel(view, currentDate)}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
            <div className="group relative">
              <IconButton
                label="ステータスフィルター"
                active={activeFilterCount > 0}
                className="gap-2 px-2 md:px-3"
              >
                <Filter className="h-5 w-5" />
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-white/25 px-1.5 text-xs">
                    {activeFilterCount}
                  </span>
                ) : null}
              </IconButton>
              <div className="invisible fixed left-3 right-3 top-[96px] z-50 rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-3 opacity-0 shadow-planner transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 md:absolute md:left-auto md:right-0 md:top-[calc(100%+8px)] md:w-[min(92vw,360px)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">ステータス</p>
                  <button
                    type="button"
                    onClick={onShowAllStatuses}
                    className="min-h-9 rounded-lg px-3 text-xs font-bold text-mint-600"
                  >
                    すべて表示
                  </button>
                </div>
                <div className="grid max-h-[50dvh] gap-2 overflow-auto planner-scroll">
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

            <IconButton
              label="再読み込み"
              onClick={onRefresh}
              disabled={loading}
              className="px-2 md:px-3"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
            </IconButton>
            <IconButton
              label={themeLabel}
              onClick={onToggleTheme}
              className="px-2 md:px-3"
            >
              {themeMode === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </IconButton>
            <IconButton
              label={googleLabel}
              active={googleConnected}
              onClick={onToggleGoogleCalendar}
              className="px-2 md:px-3"
            >
              {googleConnected ? (
                <CalendarX className="h-5 w-5" />
              ) : (
                <CalendarCheck className="h-5 w-5" />
              )}
            </IconButton>
            <IconButton label="設定" onClick={onSettings} className="px-2 md:px-3">
              <Settings className="h-5 w-5" />
            </IconButton>
            <IconButton
              label="ログアウト"
              onClick={onLogout}
              className="px-2 md:px-3"
            >
              <LogOut className="h-5 w-5" />
            </IconButton>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-center gap-2 md:flex md:items-center md:gap-3">
          <div className="grid grid-cols-[44px_minmax(64px,1fr)_44px] gap-1.5 md:flex md:items-center md:gap-2">
            <IconButton
              label={previousLabel}
              onClick={() => onDateChange(step(currentDate, -1))}
              className="px-2 md:px-3"
            >
              <ChevronLeft className="h-5 w-5" />
            </IconButton>
            <IconButton label="今日" onClick={() => onDateChange(new Date())}>
              <PanelLeftOpen className="mr-1.5 h-5 w-5 md:mr-2" />
              <span>今日</span>
            </IconButton>
            <IconButton
              label={nextLabel}
              onClick={() => onDateChange(step(currentDate, 1))}
              className="px-2 md:px-3"
            >
              <ChevronRight className="h-5 w-5" />
            </IconButton>
          </div>

          <div className="grid grid-cols-2 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-1 shadow-sm md:flex">
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

          {googleConnected ? (
            <label className="col-span-2 min-w-0 md:col-span-1 md:min-w-[240px]">
              <span className="sr-only">Googleカレンダー</span>
              <select
                value={selectedGoogleCalendarId}
                onChange={(event) => onGoogleCalendarChange(event.target.value)}
                disabled={googleCalendarsLoading || googleCalendars.length === 0}
                className="h-11 w-full rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-3 text-sm font-bold text-[color:var(--planner-text)] shadow-sm outline-none transition focus:border-mint-500 focus:ring-2 focus:ring-mint-500/20 disabled:opacity-60"
                aria-label="Googleカレンダーを選択"
              >
                {!selectedCalendarInList ? (
                  <option value={selectedGoogleCalendarId}>
                    {googleCalendarsLoading ? "カレンダー読込中" : "メイン カレンダー"}
                  </option>
                ) : null}
                {googleCalendars.map((calendar) => (
                  <option key={calendar.id} value={calendar.id}>
                    {calendar.summary}
                    {calendar.primary ? "（メイン）" : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </header>
  );
}

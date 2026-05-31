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
  Menu,
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
  selectedGoogleCalendarIds: string[];
  googleCalendarColors: Record<string, string>;
  statusOptions: StatusFilterOption[];
  hiddenStatuses: string[];
  onViewChange: (view: "week" | "month") => void;
  onDateChange: (date: Date) => void;
  onRefresh: () => void;
  onToggleTheme: () => void;
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
  onToggleGoogleCalendar,
  onToggleGoogleCalendarId,
  onGoogleCalendarColorChange,
  onShowAllGoogleCalendars,
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
  const selectedGoogleCalendarSet = new Set(selectedGoogleCalendarIds);
  const selectedGoogleCalendars = googleCalendars.filter((calendar) =>
    selectedGoogleCalendarSet.has(calendar.id),
  );
  const googleCalendarPickerLabel =
    selectedGoogleCalendars.length > 0
      ? `Googleカレンダー ${selectedGoogleCalendars.length}件`
      : "Googleカレンダー選択";

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
            <div className="group relative">
              <IconButton
                label="メニュー"
                active={activeFilterCount > 0 || googleConnected}
                className="gap-2 px-2 md:px-3"
              >
                <Menu className="h-5 w-5" />
                {activeFilterCount > 0 ? (
                  <span className="rounded-full bg-white/25 px-1.5 text-xs">
                    {activeFilterCount}
                  </span>
                ) : null}
              </IconButton>
              <div className="invisible fixed left-3 right-3 top-[96px] z-50 rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-3 opacity-0 shadow-planner transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 md:absolute md:left-auto md:right-0 md:top-[calc(100%+8px)] md:w-[min(92vw,420px)]">
                <div className="grid gap-2 border-b border-[color:var(--planner-border)] pb-3">
                  <button
                    type="button"
                    onClick={onToggleTheme}
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
                    onClick={onToggleGoogleCalendar}
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
                    onClick={onLogout}
                    className="flex min-h-11 items-center gap-3 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] px-3 text-left text-sm font-bold text-coral-500 transition active:scale-[0.99]"
                  >
                    <LogOut className="h-5 w-5" />
                    <span className="min-w-0 flex-1 truncate">ログアウト</span>
                  </button>
                </div>

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
            <div className="group relative col-span-2 md:col-span-1">
              <IconButton
                label={googleCalendarPickerLabel}
                active={selectedGoogleCalendars.length > 0}
                className="w-full gap-2 px-3 md:min-w-[220px]"
              >
                <CalendarCheck className="h-5 w-5" />
                <span className="truncate">
                  {googleCalendarsLoading
                    ? "読込中"
                    : `${Math.max(selectedGoogleCalendars.length, selectedGoogleCalendarIds.length)}件`}
                </span>
              </IconButton>
              <div className="invisible fixed left-3 right-3 top-[148px] z-50 rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-3 opacity-0 shadow-planner transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100 md:absolute md:left-auto md:right-0 md:top-[calc(100%+8px)] md:w-[min(92vw,420px)]">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">Googleカレンダー</p>
                  <button
                    type="button"
                    onClick={onShowAllGoogleCalendars}
                    disabled={googleCalendars.length === 0}
                    className="min-h-9 rounded-lg px-3 text-xs font-bold text-mint-600 disabled:opacity-45"
                  >
                    すべて表示
                  </button>
                </div>
                <div className="grid max-h-[54dvh] gap-2 overflow-auto planner-scroll">
                  {googleCalendarsLoading ? (
                    <p className="rounded-lg bg-[color:var(--planner-surface-muted)] px-3 py-2 text-sm text-[color:var(--planner-soft)]">
                      読み込み中
                    </p>
                  ) : googleCalendars.length > 0 ? (
                    googleCalendars.map((calendar) => {
                      const checked = selectedGoogleCalendarSet.has(calendar.id);
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
                              disabled={checked && selectedGoogleCalendarIds.length === 1}
                              onChange={() => onToggleGoogleCalendarId(calendar.id)}
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
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

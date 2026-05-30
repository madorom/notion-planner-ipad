"use client";

import { addDays, addMonths } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  LogOut,
  PanelLeftOpen,
  RefreshCw,
  Settings,
} from "lucide-react";
import { formatDateLabel } from "@/lib/calendar";
import { IconButton } from "@/components/icon-button";
import type { StatusFilterOption } from "@/lib/types";
import { cx } from "@/lib/utils";

type CalendarHeaderProps = {
  view: "week" | "month";
  currentDate: Date;
  loading: boolean;
  statusOptions: StatusFilterOption[];
  hiddenStatuses: string[];
  onViewChange: (view: "week" | "month") => void;
  onDateChange: (date: Date) => void;
  onRefresh: () => void;
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
  statusOptions,
  hiddenStatuses,
  onViewChange,
  onDateChange,
  onRefresh,
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

  return (
    <header className="sticky top-0 z-30 border-b border-[color:var(--planner-border)] bg-[color:var(--planner-bg)]/92 px-4 py-3 backdrop-blur md:px-6">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-mint-500 text-white shadow-planner-soft">
            <CalendarDays className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--planner-soft)]">
              Notion Planner
            </p>
            <h1 className="truncate text-2xl font-bold md:text-3xl">
              {formatDateLabel(view, currentDate)}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <IconButton
            label={previousLabel}
            onClick={() => onDateChange(step(currentDate, -1))}
          >
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <IconButton label="今日" onClick={() => onDateChange(new Date())}>
            <PanelLeftOpen className="mr-2 h-5 w-5" />
            <span>今日</span>
          </IconButton>
          <IconButton
            label={nextLabel}
            onClick={() => onDateChange(step(currentDate, 1))}
          >
            <ChevronRight className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="flex rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-1 shadow-sm">
          <button
            type="button"
            onClick={() => onViewChange("week")}
            className={`min-h-10 rounded-md px-5 text-sm font-bold transition ${
              view === "week" ? "bg-ink text-white dark:bg-mint-500" : ""
            }`}
          >
            週
          </button>
          <button
            type="button"
            onClick={() => onViewChange("month")}
            className={`min-h-10 rounded-md px-5 text-sm font-bold transition ${
              view === "month" ? "bg-ink text-white dark:bg-mint-500" : ""
            }`}
          >
            月
          </button>
        </div>

        <div className="group relative">
          <IconButton
            label="ステータスフィルター"
            active={activeFilterCount > 0}
            className="gap-2"
          >
            <Filter className="h-5 w-5" />
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-white/25 px-1.5 text-xs">
                {activeFilterCount}
              </span>
            ) : null}
          </IconButton>
          <div className="invisible absolute right-0 top-[calc(100%+8px)] z-50 w-[min(88vw,360px)] rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-3 opacity-0 shadow-planner transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
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

        <IconButton label="再読み込み" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </IconButton>
        <IconButton label="設定" onClick={onSettings}>
          <Settings className="h-5 w-5" />
        </IconButton>
        <IconButton label="ログアウト" onClick={onLogout}>
          <LogOut className="h-5 w-5" />
        </IconButton>
      </div>
    </header>
  );
}

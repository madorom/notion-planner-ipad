"use client";

import { format, parseISO } from "date-fns";
import { Clock } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PlannerTask } from "@/lib/types";
import { cx } from "@/lib/utils";

type TaskCardProps = {
  task: PlannerTask;
  compact?: boolean;
  style?: CSSProperties;
  isDragging?: boolean;
  readOnly?: boolean;
  onClick: (task: PlannerTask) => void;
  onPointerDown?: (
    task: PlannerTask,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

const EDIT_OPEN_DELAY_MS = 240;
const TAP_MOVE_TOLERANCE_PX = 8;

const statusThemes = {
  default: {
    card:
      "border-stone-300 border-l-stone-500 bg-stone-50/95 dark:border-stone-700 dark:border-l-stone-400 dark:bg-stone-900/60",
    title: "text-stone-950 dark:text-stone-50",
    meta: "text-stone-600 dark:text-stone-300",
    badge: "bg-stone-200/80 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
  },
  gray: {
    card:
      "border-slate-300 border-l-slate-500 bg-slate-50/95 dark:border-slate-700 dark:border-l-slate-400 dark:bg-slate-900/60",
    title: "text-slate-950 dark:text-slate-50",
    meta: "text-slate-600 dark:text-slate-300",
    badge: "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
  brown: {
    card:
      "border-orange-300 border-l-orange-700 bg-orange-50/95 dark:border-orange-900/70 dark:border-l-orange-500 dark:bg-orange-950/35",
    title: "text-orange-950 dark:text-orange-50",
    meta: "text-orange-800 dark:text-orange-200",
    badge: "bg-orange-200/80 text-orange-900 dark:bg-orange-900/70 dark:text-orange-100",
  },
  orange: {
    card:
      "border-orange-300 border-l-orange-500 bg-orange-50/95 dark:border-orange-900/70 dark:border-l-orange-400 dark:bg-orange-950/35",
    title: "text-orange-950 dark:text-orange-50",
    meta: "text-orange-800 dark:text-orange-200",
    badge: "bg-orange-200/80 text-orange-900 dark:bg-orange-900/70 dark:text-orange-100",
  },
  yellow: {
    card:
      "border-amber-300 border-l-amber-500 bg-amber-50/95 dark:border-amber-900/70 dark:border-l-amber-400 dark:bg-amber-950/35",
    title: "text-amber-950 dark:text-amber-50",
    meta: "text-amber-800 dark:text-amber-200",
    badge: "bg-amber-200/80 text-amber-900 dark:bg-amber-900/70 dark:text-amber-100",
  },
  green: {
    card:
      "border-emerald-300 border-l-emerald-500 bg-emerald-50/95 dark:border-emerald-900/70 dark:border-l-emerald-400 dark:bg-emerald-950/35",
    title: "text-emerald-950 dark:text-emerald-50",
    meta: "text-emerald-800 dark:text-emerald-200",
    badge:
      "bg-emerald-200/80 text-emerald-900 dark:bg-emerald-900/70 dark:text-emerald-100",
  },
  blue: {
    card:
      "border-sky-300 border-l-sky-500 bg-sky-50/95 dark:border-sky-900/70 dark:border-l-sky-400 dark:bg-sky-950/35",
    title: "text-sky-950 dark:text-sky-50",
    meta: "text-sky-800 dark:text-sky-200",
    badge: "bg-sky-200/80 text-sky-900 dark:bg-sky-900/70 dark:text-sky-100",
  },
  purple: {
    card:
      "border-violet-300 border-l-violet-500 bg-violet-50/95 dark:border-violet-900/70 dark:border-l-violet-400 dark:bg-violet-950/35",
    title: "text-violet-950 dark:text-violet-50",
    meta: "text-violet-800 dark:text-violet-200",
    badge:
      "bg-violet-200/80 text-violet-900 dark:bg-violet-900/70 dark:text-violet-100",
  },
  pink: {
    card:
      "border-pink-300 border-l-pink-500 bg-pink-50/95 dark:border-pink-900/70 dark:border-l-pink-400 dark:bg-pink-950/35",
    title: "text-pink-950 dark:text-pink-50",
    meta: "text-pink-800 dark:text-pink-200",
    badge: "bg-pink-200/80 text-pink-900 dark:bg-pink-900/70 dark:text-pink-100",
  },
  red: {
    card:
      "border-rose-300 border-l-rose-500 bg-rose-50/95 dark:border-rose-900/70 dark:border-l-rose-400 dark:bg-rose-950/35",
    title: "text-rose-950 dark:text-rose-50",
    meta: "text-rose-800 dark:text-rose-200",
    badge: "bg-rose-200/80 text-rose-900 dark:bg-rose-900/70 dark:text-rose-100",
  },
};

function statusTheme(statusColor?: string) {
  if (!statusColor || !(statusColor in statusThemes)) {
    return statusThemes.default;
  }

  return statusThemes[statusColor as keyof typeof statusThemes];
}

function hexToRgb(hex?: string) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) {
    return null;
  }

  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function rgba(hex: string, alpha: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return undefined;
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function TaskCard({
  task,
  compact,
  style,
  isDragging,
  readOnly,
  onClick,
  onPointerDown,
}: TaskCardProps) {
  const pendingOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    cancelled: boolean;
  } | null>(null);
  const theme = statusTheme(task.statusColor);
  const customColor = hexToRgb(task.colorHex) ? task.colorHex : undefined;
  const timeLabel = task.isAllDay
    ? "終日"
    : `${format(parseISO(task.start), "HH:mm")}${
        task.end ? `-${format(parseISO(task.end), "HH:mm")}` : ""
      }`;

  const clearPendingOpen = useCallback(() => {
    if (pendingOpenTimerRef.current) {
      clearTimeout(pendingOpenTimerRef.current);
      pendingOpenTimerRef.current = null;
    }
  }, []);

  const scheduleOpen = useCallback(() => {
    clearPendingOpen();
    pendingOpenTimerRef.current = setTimeout(() => {
      pendingOpenTimerRef.current = null;
      onClick(task);
    }, EDIT_OPEN_DELAY_MS);
  }, [clearPendingOpen, onClick, task]);

  useEffect(() => clearPendingOpen, [clearPendingOpen]);

  function updatePointerCancellation(event: ReactPointerEvent<HTMLButtonElement>) {
    const pointerStart = pointerStartRef.current;
    if (!pointerStart || pointerStart.pointerId !== event.pointerId) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - pointerStart.x,
      event.clientY - pointerStart.y,
    );

    if (distance > TAP_MOVE_TOLERANCE_PX) {
      pointerStart.cancelled = true;
      clearPendingOpen();
    }
  }

  return (
    <button
      type="button"
      data-task-card
      style={{
        ...(customColor
          ? {
              backgroundColor: rgba(customColor, 0.13),
              borderColor: rgba(customColor, 0.38),
              borderLeftColor: customColor,
            }
          : {}),
        ...style,
        touchAction: onPointerDown && !readOnly ? "none" : style?.touchAction,
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (readOnly || event.detail !== 0 || isDragging) {
          return;
        }
        scheduleOpen();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (readOnly) {
          return;
        }

        if (event.button !== 0) {
          return;
        }

        clearPendingOpen();
        pointerStartRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          cancelled: false,
        };
        onPointerDown?.(task, event);
      }}
      onPointerMove={updatePointerCancellation}
      onPointerCancel={() => {
        pointerStartRef.current = null;
        clearPendingOpen();
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.button !== 0) {
          return;
        }

        updatePointerCancellation(event);
        const pointerStart = pointerStartRef.current;
        pointerStartRef.current = null;

        if (!pointerStart || pointerStart.cancelled || isDragging) {
          return;
        }

        scheduleOpen();
      }}
      className={cx(
        "w-full overflow-hidden rounded-lg border border-l-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-planner-soft active:scale-[0.99]",
        customColor ? "bg-[color:var(--planner-surface)]" : theme.card,
        readOnly &&
          "cursor-default hover:translate-y-0 hover:shadow-sm active:scale-100",
        onPointerDown && !readOnly && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-35 ring-2 ring-mint-500/40",
        compact ? "px-2 py-1.5" : "px-3 py-2.5",
      )}
    >
      <div
        className={cx(
          "line-clamp-2 font-bold leading-snug",
          customColor ? "text-[color:var(--planner-ink)]" : theme.title,
          compact ? "text-xs" : "text-sm",
        )}
      >
        {task.title}
      </div>
      <div
        className={cx(
          "mt-1 flex items-center gap-1.5",
          customColor ? "text-[color:var(--planner-soft)]" : theme.meta,
          compact ? "text-[11px]" : "text-xs",
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        <span>{timeLabel}</span>
      </div>
    </button>
  );
}

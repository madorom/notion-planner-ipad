import {
  addDays,
  addHours,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  setHours,
  setMinutes,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ja } from "date-fns/locale";
import type { PlannerTask } from "@/lib/types";

export const WEEK_STARTS_ON = 1;
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 23;
export const HOUR_HEIGHT = 72;

export function startOfPlannerWeek(anchor: Date) {
  return startOfDay(
    startOfWeek(anchor, {
      weekStartsOn: WEEK_STARTS_ON,
    }),
  );
}

export function getWeekDays(anchor: Date) {
  const start = startOfDay(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getMonthDays(anchor: Date) {
  const start = startOfWeek(startOfMonth(anchor), {
    weekStartsOn: WEEK_STARTS_ON,
  });
  const end = endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON });
  const days: Date[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

export function getViewRange(view: "week" | "month", anchor: Date) {
  if (view === "week") {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 7) };
  }

  const days = getMonthDays(anchor);
  return { start: startOfDay(days[0]), end: addDays(startOfDay(days.at(-1)!), 1) };
}

export function formatDateLabel(view: "week" | "month", anchor: Date) {
  if (view === "month") {
    return format(anchor, "yyyy年M月", { locale: ja });
  }

  const days = getWeekDays(anchor);
  return `${format(days[0], "M/d", { locale: ja })} - ${format(
    days[6],
    "M/d",
    { locale: ja },
  )}`;
}

export function dayKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function isCurrentMonthDay(day: Date, anchor: Date) {
  return isSameMonth(day, anchor);
}

export function taskStartsOn(task: PlannerTask, day: Date) {
  return isSameDay(parseISO(task.start), day);
}

export function tasksForDay(tasks: PlannerTask[], day: Date) {
  return tasks
    .filter((task) => taskStartsOn(task, day))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function allDayTasksForDay(tasks: PlannerTask[], day: Date) {
  const targetDay = startOfDay(day);

  return tasks
    .filter((task) => {
      if (!task.isAllDay) {
        return false;
      }

      const start = startOfDay(parseISO(task.start));
      if (!task.end || task.source !== "google") {
        return isSameDay(start, targetDay);
      }

      const exclusiveEnd = startOfDay(parseISO(task.end));
      return targetDay >= start && targetDay < exclusiveEnd;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function taskPosition(task: PlannerTask) {
  const start = parseISO(task.start);
  const end = task.end ? parseISO(task.end) : addHours(start, 1);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const visibleStart = DAY_START_HOUR * 60;
  const top = Math.max(0, ((startMinutes - visibleStart) / 60) * HOUR_HEIGHT);
  const height = Math.max(48, (differenceInMinutes(end, start) / 60) * HOUR_HEIGHT);
  return { top, height };
}

export function makeDefaultRange(day: Date, hour = 9) {
  const start = setMinutes(setHours(startOfDay(day), hour), 0);
  return { start, end: addHours(start, 1) };
}

export function datetimeLocalValue(date: Date | string) {
  const target = typeof date === "string" ? parseISO(date) : date;
  return format(target, "yyyy-MM-dd'T'HH:mm");
}

export function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

export function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

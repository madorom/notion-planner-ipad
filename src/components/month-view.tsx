"use client";

import { addMonths, format, isSameDay, isSameMonth } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  getMonthDays,
  isCurrentMonthDay,
  makeDefaultRange,
  tasksForDay,
} from "@/lib/calendar";
import { useHorizontalDateSwipe } from "@/lib/use-horizontal-date-swipe";
import type { PlannerTask } from "@/lib/types";
import { TaskCard } from "@/components/task-card";
import { cx } from "@/lib/utils";

type MonthViewProps = {
  currentDate: Date;
  tasks: PlannerTask[];
  onCreate: (start: Date, end: Date) => void;
  onEdit: (task: PlannerTask) => void;
  onDateChange: (date: Date) => void;
};

const weekdays = ["月", "火", "水", "木", "金", "土", "日"];

export function MonthView({
  currentDate,
  tasks,
  onCreate,
  onEdit,
  onDateChange,
}: MonthViewProps) {
  const days = getMonthDays(currentDate);
  const previousDateRef = useRef(currentDate);
  const [slideDirection, setSlideDirection] = useState<"next" | "previous">("next");
  const {
    offset: swipeOffset,
    isClickSuppressed: isSwipeClickSuppressed,
    swipeHandlers,
  } = useHorizontalDateSwipe({
    onSwipe: (direction) => onDateChange(addMonths(currentDate, direction)),
  });

  useEffect(() => {
    if (!isSameMonth(previousDateRef.current, currentDate)) {
      setSlideDirection(
        currentDate.getTime() > previousDateRef.current.getTime()
          ? "next"
          : "previous",
      );
      previousDateRef.current = currentDate;
    }
  }, [currentDate]);

  function handleCreate(start: Date, end: Date) {
    if (isSwipeClickSuppressed()) {
      return;
    }

    onCreate(start, end);
  }

  function handleEdit(task: PlannerTask) {
    if (isSwipeClickSuppressed()) {
      return;
    }

    onEdit(task);
  }

  return (
    <section className="mx-auto max-w-[1500px] px-4 py-4 md:px-6">
      <div className="overflow-hidden rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] shadow-planner">
        <div
          key={format(currentDate, "yyyy-MM")}
          className="calendar-slide-layer"
          data-direction={slideDirection}
        >
          <div
            className="calendar-gesture-layer"
            style={{ transform: `translate3d(${swipeOffset}px, 0, 0)` }}
            {...swipeHandlers}
          >
            <div className="grid grid-cols-7 border-b border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]">
              {weekdays.map((weekday) => (
                <div
                  key={weekday}
                  className="min-h-12 border-r border-[color:var(--planner-border)] px-3 py-3 text-center text-sm font-bold text-[color:var(--planner-soft)] last:border-r-0"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayTasks = tasksForDay(tasks, day);
                const visibleTasks = dayTasks.slice(0, 3);
                const hiddenCount = dayTasks.length - visibleTasks.length;
                const { start, end } = makeDefaultRange(day, 9);

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => handleCreate(start, end)}
                    className={cx(
                      "min-h-[150px] border-b border-r border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-2 text-left transition hover:bg-mint-500/5 active:bg-mint-500/10 md:min-h-[168px]",
                      !isCurrentMonthDay(day, currentDate) && "opacity-45",
                      isSameDay(day, new Date()) && "bg-mint-500/10",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold">
                        {format(day, "d")}
                      </span>
                      {dayTasks.length > 0 ? (
                        <span className="rounded-full bg-[color:var(--planner-surface-muted)] px-2 py-1 text-xs font-bold text-[color:var(--planner-soft)]">
                          {dayTasks.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid gap-1.5">
                      {visibleTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          compact
                          onClick={handleEdit}
                        />
                      ))}
                      {hiddenCount > 0 ? (
                        <div className="rounded-md bg-ink px-2 py-1 text-xs font-bold text-white dark:bg-mint-500">
                          +{hiddenCount}件
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

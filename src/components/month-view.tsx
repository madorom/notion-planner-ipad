"use client";

import { format, isSameDay } from "date-fns";
import { getMonthDays, isCurrentMonthDay, makeDefaultRange, tasksForDay } from "@/lib/calendar";
import type { PlannerTask } from "@/lib/types";
import { TaskCard } from "@/components/task-card";
import { cx } from "@/lib/utils";

type MonthViewProps = {
  currentDate: Date;
  tasks: PlannerTask[];
  onCreate: (start: Date, end: Date) => void;
  onEdit: (task: PlannerTask) => void;
};

const weekdays = ["月", "火", "水", "木", "金", "土", "日"];

export function MonthView({ currentDate, tasks, onCreate, onEdit }: MonthViewProps) {
  const days = getMonthDays(currentDate);

  return (
    <section className="mx-auto max-w-[1500px] px-4 py-4 md:px-6">
      <div className="overflow-hidden rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] shadow-planner">
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
                onClick={() => onCreate(start, end)}
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
                    <TaskCard key={task.id} task={task} compact onClick={onEdit} />
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
    </section>
  );
}

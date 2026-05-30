"use client";

import {
  addDays,
  addHours,
  addMinutes,
  differenceInMinutes,
  format,
  isSameDay,
  parseISO,
  setHours,
  setMinutes,
} from "date-fns";
import { ja } from "date-fns/locale";
import type {
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  getWeekDays,
  hourLabel,
  tasksForDay,
} from "@/lib/calendar";
import type { PlannerTask } from "@/lib/types";
import { TaskCard } from "@/components/task-card";
import { clamp } from "@/lib/utils";

type WeekViewProps = {
  currentDate: Date;
  tasks: PlannerTask[];
  onCreate: (start: Date, end: Date) => void;
  onEdit: (task: PlannerTask) => void;
  onDateChange: (date: Date) => void;
  onMoveTask: (task: PlannerTask, start: Date, end: Date) => void;
};

const hours = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, index) => DAY_START_HOUR + index,
);
const WHEEL_SLIDE_THRESHOLD = 80;
const WHEEL_MAX_OFFSET = 118;
const WHEEL_SLIDE_COOLDOWN_MS = 360;
const WHEEL_SETTLE_DELAY_MS = 180;
const TIME_AXIS_WIDTH = 72;
const DRAG_START_DISTANCE = 8;
const DRAG_SNAP_MINUTES = 15;

type LayoutTask = {
  task: PlannerTask;
  startMinute: number;
  endMinute: number;
  top: number;
  height: number;
  lane: number;
  laneCount: number;
};

type DragSession = {
  task: PlannerTask;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  durationMinutes: number;
  grabOffsetMinutes: number;
  active: boolean;
};

type DragPreview = {
  task: PlannerTask;
  dayIndex: number;
  start: Date;
  end: Date;
  top: number;
  height: number;
};

function dateAtMinute(day: Date, totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return setMinutes(setHours(day, hour), minutes);
}

function dateAtSlot(day: Date, minutesFromStart: number) {
  return dateAtMinute(day, DAY_START_HOUR * 60 + minutesFromStart);
}

function roundToSnap(totalMinutes: number) {
  return Math.round(totalMinutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
}

function taskInterval(task: PlannerTask): LayoutTask {
  const start = parseISO(task.start);
  const fallbackEnd = addHours(start, 1);
  const end = task.end ? parseISO(task.end) : fallbackEnd;
  const safeEnd = end > start ? end : fallbackEnd;
  const visibleStart = DAY_START_HOUR * 60;
  const visibleEnd = DAY_END_HOUR * 60;
  const rawStart = start.getHours() * 60 + start.getMinutes();
  const rawEnd =
    rawStart + Math.max(DRAG_SNAP_MINUTES, differenceInMinutes(safeEnd, start));
  const startMinute = clamp(rawStart, visibleStart, visibleEnd);
  const endMinute = Math.max(
    startMinute + 30,
    clamp(rawEnd, visibleStart, visibleEnd),
  );

  return {
    task,
    startMinute,
    endMinute,
    top: ((startMinute - visibleStart) / 60) * HOUR_HEIGHT,
    height: Math.max(48, ((endMinute - startMinute) / 60) * HOUR_HEIGHT),
    lane: 0,
    laneCount: 1,
  };
}

function assignLanes(group: LayoutTask[]) {
  const laneEnds: number[] = [];

  for (const item of group) {
    const availableLane = laneEnds.findIndex((endMinute) => endMinute <= item.startMinute);
    const lane = availableLane === -1 ? laneEnds.length : availableLane;
    item.lane = lane;
    laneEnds[lane] = item.endMinute;
  }

  for (const item of group) {
    item.laneCount = Math.max(1, laneEnds.length);
  }
}

function layoutTimedTasks(tasks: PlannerTask[]) {
  const intervals = tasks.map(taskInterval).sort((a, b) => {
    if (a.startMinute !== b.startMinute) {
      return a.startMinute - b.startMinute;
    }

    return b.endMinute - a.endMinute;
  });

  const groups: LayoutTask[][] = [];
  let currentGroup: LayoutTask[] = [];
  let currentGroupEnd = -1;

  for (const item of intervals) {
    if (currentGroup.length === 0 || item.startMinute >= currentGroupEnd) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [item];
      currentGroupEnd = item.endMinute;
      continue;
    }

    currentGroup.push(item);
    currentGroupEnd = Math.max(currentGroupEnd, item.endMinute);
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  for (const group of groups) {
    assignLanes(group);
  }

  return intervals;
}

export function WeekView({
  currentDate,
  tasks,
  onCreate,
  onEdit,
  onDateChange,
  onMoveTask,
}: WeekViewProps) {
  const days = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const bodyHeight = hours.length * HOUR_HEIGHT;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const wheelDeltaRef = useRef(0);
  const wheelOffsetRef = useRef(0);
  const lastWheelSlideAtRef = useRef(0);
  const previousDateRef = useRef(currentDate);
  const wheelSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [slideDirection, setSlideDirection] = useState<"next" | "previous">("next");
  const [wheelOffset, setWheelOffset] = useState(0);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const dragPointToPreview = useCallback(
    (
      clientX: number,
      clientY: number,
      task: PlannerTask,
      durationMinutes: number,
      grabOffsetMinutes: number,
    ): DragPreview | null => {
      const grid = gridRef.current;
      if (!grid) {
        return null;
      }

      const rect = grid.getBoundingClientRect();
      const dayWidth = (rect.width - TIME_AXIS_WIDTH) / 7;
      const relativeX = clientX - rect.left - TIME_AXIS_WIDTH;
      const dayIndex = clamp(Math.floor(relativeX / dayWidth), 0, 6);
      const relativeY = clamp(clientY - rect.top, 0, bodyHeight);
      const pointerMinute =
        DAY_START_HOUR * 60 + (relativeY / HOUR_HEIGHT) * 60;
      const visibleStart = DAY_START_HOUR * 60;
      const visibleEnd = DAY_END_HOUR * 60;
      const latestStart = visibleEnd - durationMinutes;
      const startMinute = clamp(
        roundToSnap(pointerMinute - grabOffsetMinutes),
        visibleStart,
        Math.max(visibleStart, latestStart),
      );
      const endMinute = startMinute + durationMinutes;
      const start = dateAtMinute(days[dayIndex], startMinute);
      const end = dateAtMinute(days[dayIndex], endMinute);

      return {
        task,
        dayIndex,
        start,
        end,
        top: ((startMinute - visibleStart) / 60) * HOUR_HEIGHT,
        height: Math.max(48, (durationMinutes / 60) * HOUR_HEIGHT),
      };
    },
    [bodyHeight, days],
  );

  function setCurrentDragPreview(preview: DragPreview | null) {
    dragPreviewRef.current = preview;
    setDragPreview(preview);
  }

  useEffect(() => {
    if (!isSameDay(previousDateRef.current, currentDate)) {
      setSlideDirection(
        currentDate.getTime() > previousDateRef.current.getTime()
          ? "next"
          : "previous",
      );
      previousDateRef.current = currentDate;
      wheelDeltaRef.current = 0;
      wheelOffsetRef.current = 0;
      setWheelOffset(0);
    }
  }, [currentDate]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const distance = Math.hypot(
        event.clientX - session.startClientX,
        event.clientY - session.startClientY,
      );

      if (!session.active && distance < DRAG_START_DISTANCE) {
        return;
      }

      event.preventDefault();
      session.active = true;
      const nextPreview = dragPointToPreview(
        event.clientX,
        event.clientY,
        session.task,
        session.durationMinutes,
        session.grabOffsetMinutes,
      );
      setCurrentDragPreview(nextPreview);
    }

    function finishPointerDrag(event: PointerEvent) {
      const session = dragSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const preview = dragPreviewRef.current;
      const wasActive = session.active;
      dragSessionRef.current = null;
      setCurrentDragPreview(null);

      if (!wasActive || !preview) {
        return;
      }

      suppressClickUntilRef.current = Date.now() + 500;
      onMoveTask(session.task, preview.start, preview.end);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishPointerDrag);
    window.addEventListener("pointercancel", finishPointerDrag);

    return () => {
      if (wheelSettleTimerRef.current) {
        clearTimeout(wheelSettleTimerRef.current);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
    };
  }, [dragPointToPreview, onMoveTask]);

  function handleColumnClick(day: Date, event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = clamp(event.clientY - rect.top, 0, bodyHeight);
    const rawMinutes = (y / HOUR_HEIGHT) * 60;
    const roundedMinutes =
      Math.round(rawMinutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
    const start = dateAtSlot(day, roundedMinutes);
    onCreate(start, addMinutes(start, 60));
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    if (dragSessionRef.current?.active) {
      return;
    }

    const horizontalDelta =
      Math.abs(event.deltaX) >= Math.abs(event.deltaY)
        ? event.deltaX
        : event.shiftKey
          ? event.deltaY
          : 0;

    if (Math.abs(horizontalDelta) < 8) {
      return;
    }

    event.preventDefault();
    wheelDeltaRef.current += horizontalDelta;
    wheelOffsetRef.current = clamp(
      wheelOffsetRef.current - horizontalDelta,
      -WHEEL_MAX_OFFSET,
      WHEEL_MAX_OFFSET,
    );
    setWheelOffset(wheelOffsetRef.current);

    if (wheelSettleTimerRef.current) {
      clearTimeout(wheelSettleTimerRef.current);
    }

    const now = Date.now();
    if (now - lastWheelSlideAtRef.current < WHEEL_SLIDE_COOLDOWN_MS) {
      wheelSettleTimerRef.current = setTimeout(() => {
        wheelDeltaRef.current = 0;
        wheelOffsetRef.current = 0;
        setWheelOffset(0);
      }, WHEEL_SETTLE_DELAY_MS);
      return;
    }

    if (Math.abs(wheelDeltaRef.current) < WHEEL_SLIDE_THRESHOLD) {
      wheelSettleTimerRef.current = setTimeout(() => {
        wheelDeltaRef.current = 0;
        wheelOffsetRef.current = 0;
        setWheelOffset(0);
      }, WHEEL_SETTLE_DELAY_MS);
      return;
    }

    const direction = wheelDeltaRef.current > 0 ? 1 : -1;
    wheelDeltaRef.current = 0;
    wheelOffsetRef.current = direction > 0 ? -WHEEL_MAX_OFFSET : WHEEL_MAX_OFFSET;
    setWheelOffset(wheelOffsetRef.current);
    lastWheelSlideAtRef.current = now;
    onDateChange(addDays(currentDate, direction));
  }

  function pointerMinuteFromY(clientY: number) {
    const grid = gridRef.current;
    if (!grid) {
      return DAY_START_HOUR * 60;
    }

    const rect = grid.getBoundingClientRect();
    const relativeY = clamp(clientY - rect.top, 0, bodyHeight);
    return DAY_START_HOUR * 60 + (relativeY / HOUR_HEIGHT) * 60;
  }

  function beginTaskDrag(
    task: PlannerTask,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (task.isAllDay || event.button !== 0) {
      return;
    }

    const interval = taskInterval(task);
    const pointerMinute = pointerMinuteFromY(event.clientY);

    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragSessionRef.current = {
      task,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      durationMinutes: interval.endMinute - interval.startMinute,
      grabOffsetMinutes: clamp(
        pointerMinute - interval.startMinute,
        0,
        Math.max(0, interval.endMinute - interval.startMinute - DRAG_SNAP_MINUTES),
      ),
      active: false,
    };
  }

  function handleTaskClick(task: PlannerTask) {
    if (Date.now() < suppressClickUntilRef.current) {
      return;
    }

    onEdit(task);
  }

  return (
    <section className="mx-auto max-w-[1500px] px-4 py-4 md:px-6">
      <div className="overflow-hidden rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] shadow-planner">
        <div
          key={format(currentDate, "yyyy-MM-dd")}
          className="week-slide-layer"
          data-direction={slideDirection}
        >
          <div
            className="week-gesture-layer"
            style={{ transform: `translate3d(${wheelOffset}px, 0, 0)` }}
          >
            <div className="grid grid-cols-[72px_repeat(7,minmax(128px,1fr))] border-b border-[color:var(--planner-border)] bg-[color:var(--planner-surface)]">
              <div className="border-r border-[color:var(--planner-border)]" />
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`min-h-20 border-r border-[color:var(--planner-border)] px-3 py-3 last:border-r-0 ${
                    isSameDay(day, new Date()) ? "bg-mint-500/10" : ""
                  }`}
                >
                  <div className="text-xs font-bold text-[color:var(--planner-soft)]">
                    {format(day, "EEE", { locale: ja })}
                  </div>
                  <div className="mt-1 text-2xl font-bold">{format(day, "d")}</div>
                </div>
              ))}
            </div>

            <div className="planner-scroll overflow-auto" onWheel={handleWheel}>
              <div
                ref={gridRef}
                className="grid grid-cols-[72px_repeat(7,minmax(128px,1fr))]"
                style={{ minHeight: bodyHeight }}
              >
                <div className="relative border-r border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]">
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      className="border-b border-[color:var(--planner-border)] pr-2 pt-2 text-right text-xs font-semibold text-[color:var(--planner-soft)]"
                      style={{ height: HOUR_HEIGHT }}
                    >
                      {hourLabel(hour)}
                    </div>
                  ))}
                </div>

                {days.map((day, dayIndex) => {
                  const dayTasks = tasksForDay(tasks, day);
                  const timedTasks = dayTasks.filter((task) => !task.isAllDay);
                  const laidOutTasks = layoutTimedTasks(timedTasks);
                  const allDayTasks = dayTasks.filter((task) => task.isAllDay);

                  return (
                    <div
                      key={day.toISOString()}
                      className="planner-grid-paper relative border-r border-[color:var(--planner-border)] last:border-r-0"
                      style={{ height: bodyHeight }}
                      onClick={(event) => handleColumnClick(day, event)}
                    >
                      {allDayTasks.length > 0 ? (
                        <div className="absolute left-2 right-2 top-2 z-20 grid gap-1">
                          {allDayTasks.slice(0, 2).map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              compact
                              onClick={handleTaskClick}
                            />
                          ))}
                        </div>
                      ) : null}

                      {dragPreview?.dayIndex === dayIndex ? (
                        <div
                          className="pointer-events-none absolute left-1.5 right-1.5 z-30 rounded-lg border-2 border-dashed border-mint-500 bg-mint-500/15 px-2 py-1 text-xs font-bold text-mint-600 shadow-planner-soft dark:text-mint-500"
                          style={{
                            top: dragPreview.top,
                            height: dragPreview.height,
                          }}
                        >
                          {format(dragPreview.start, "HH:mm")}-
                          {format(dragPreview.end, "HH:mm")}
                        </div>
                      ) : null}

                      {laidOutTasks.map((layout) => {
                        const laneWidth = 100 / layout.laneCount;
                        const isDense = layout.laneCount > 1 || layout.height < 76;
                        const isDragging =
                          dragPreview?.task.id === layout.task.id;

                        return (
                          <TaskCard
                            key={layout.task.id}
                            task={layout.task}
                            compact={isDense}
                            isDragging={isDragging}
                            style={{
                              position: "absolute",
                              top: layout.top,
                              left: `calc(${layout.lane * laneWidth}% + 6px)`,
                              width: `calc(${laneWidth}% - 10px)`,
                              height: layout.height,
                              zIndex: 10 + layout.lane,
                            }}
                            onClick={handleTaskClick}
                            onPointerDown={beginTaskDrag}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

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
  PointerEvent as ReactPointerEvent,
  UIEvent,
  WheelEvent,
} from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_HEIGHT,
  allDayTasksForDay,
  getWeekDays,
  hourLabel,
  tasksForDay,
} from "@/lib/calendar";
import type { PlannerTask } from "@/lib/types";
import { TaskCard } from "@/components/task-card";
import { useHorizontalDateSwipe } from "@/lib/use-horizontal-date-swipe";
import { clamp } from "@/lib/utils";

type WeekViewProps = {
  currentDate: Date;
  tasks: PlannerTask[];
  editable: boolean;
  onCreate: (start: Date, end: Date) => void;
  onEdit: (task: PlannerTask) => void;
  onDateChange: (date: Date) => void;
  onMoveTask: (task: PlannerTask, start: Date, end: Date) => void;
};

const hours = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, index) => DAY_START_HOUR + index,
);
const WHEEL_SLIDE_THRESHOLD = 54;
const WHEEL_MAX_OFFSET = 118;
const WHEEL_SLIDE_COOLDOWN_MS = 80;
const WHEEL_SETTLE_DELAY_MS = 120;
const TIME_AXIS_WIDTH = 72;
const DRAG_START_DISTANCE = 8;
const DRAG_SNAP_MINUTES = 15;
const CREATE_HOLD_DELAY_MS = 260;
const CREATE_HOLD_MOVE_TOLERANCE = 10;
const WEEK_SWIPE_DAY_STEP = 1;
const WEEK_PAGE_DAY_OFFSETS = [-WEEK_SWIPE_DAY_STEP, 0, WEEK_SWIPE_DAY_STEP] as const;

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

type CreateHoldSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  timer: ReturnType<typeof setTimeout>;
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
  editable,
  onCreate,
  onEdit,
  onDateChange,
  onMoveTask,
}: WeekViewProps) {
  const days = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const weekPages = useMemo(
    () =>
      WEEK_PAGE_DAY_OFFSETS.map((dayOffset) => ({
        dayOffset,
        days: getWeekDays(addDays(currentDate, dayOffset)),
      })),
    [currentDate],
  );
  const bodyHeight = hours.length * HOUR_HEIGHT;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRefs = useRef<Array<HTMLDivElement | null>>([]);
  const horizontalScrollLeftRef = useRef(0);
  const timeScrollRefs = useRef<Array<HTMLDivElement | null>>([]);
  const timeScrollTopRef = useRef(0);
  const wheelDeltaRef = useRef(0);
  const wheelOffsetRef = useRef(0);
  const lastWheelSlideAtRef = useRef(0);
  const previousDateRef = useRef(currentDate);
  const wheelSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const createHoldSessionRef = useRef<CreateHoldSession | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [slideDirection, setSlideDirection] = useState<"next" | "previous">("next");
  const [wheelOffset, setWheelOffset] = useState(0);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const {
    offset: swipeOffset,
    isClickSuppressed: isSwipeClickSuppressed,
    swipeHandlers,
  } = useHorizontalDateSwipe({
    disabled: Boolean(dragSessionRef.current?.active),
    onSwipe: (direction) =>
      onDateChange(addDays(currentDate, direction * WEEK_SWIPE_DAY_STEP)),
  });

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

  const cancelCreateHold = useCallback(() => {
    const session = createHoldSessionRef.current;
    if (session) {
      clearTimeout(session.timer);
      createHoldSessionRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (editable) {
      return;
    }

    cancelCreateHold();
    dragSessionRef.current = null;
    setCurrentDragPreview(null);
  }, [cancelCreateHold, editable]);

  function syncTimeScrollTop(scrollTop: number, source?: HTMLDivElement) {
    timeScrollTopRef.current = scrollTop;

    for (const timeScroll of timeScrollRefs.current) {
      if (!timeScroll || timeScroll === source) {
        continue;
      }

      if (Math.abs(timeScroll.scrollTop - scrollTop) > 1) {
        timeScroll.scrollTop = scrollTop;
      }
    }
  }

  function syncHorizontalScrollLeft(scrollLeft: number, source?: HTMLDivElement) {
    horizontalScrollLeftRef.current = scrollLeft;

    for (const horizontalScroll of horizontalScrollRefs.current) {
      if (!horizontalScroll || horizontalScroll === source) {
        continue;
      }

      if (Math.abs(horizontalScroll.scrollLeft - scrollLeft) > 1) {
        horizontalScroll.scrollLeft = scrollLeft;
      }
    }
  }

  function setTimeScrollNode(index: number, node: HTMLDivElement | null) {
    timeScrollRefs.current[index] = node;

    if (node) {
      node.scrollTop = timeScrollTopRef.current;
    }
  }

  function setHorizontalScrollNode(index: number, node: HTMLDivElement | null) {
    horizontalScrollRefs.current[index] = node;

    if (node) {
      node.scrollLeft = horizontalScrollLeftRef.current;
    }
  }

  useLayoutEffect(() => {
    syncTimeScrollTop(timeScrollTopRef.current);
    syncHorizontalScrollLeft(horizontalScrollLeftRef.current);
  }, [currentDate]);

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
      if (!editable) {
        return;
      }

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

    function handleCreateHoldMove(event: PointerEvent) {
      if (!editable) {
        return;
      }

      const session = createHoldSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const distance = Math.hypot(
        event.clientX - session.startClientX,
        event.clientY - session.startClientY,
      );

      if (distance > CREATE_HOLD_MOVE_TOLERANCE) {
        cancelCreateHold();
      }
    }

    function finishPointerDrag(event: PointerEvent) {
      const createSession = createHoldSessionRef.current;
      if (createSession?.pointerId === event.pointerId) {
        cancelCreateHold();
      }

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

    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointermove", handleCreateHoldMove, true);
    window.addEventListener("pointerup", finishPointerDrag, true);
    window.addEventListener("pointercancel", finishPointerDrag, true);

    return () => {
      if (wheelSettleTimerRef.current) {
        clearTimeout(wheelSettleTimerRef.current);
      }
      cancelCreateHold();
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointermove", handleCreateHoldMove, true);
      window.removeEventListener("pointerup", finishPointerDrag, true);
      window.removeEventListener("pointercancel", finishPointerDrag, true);
    };
  }, [cancelCreateHold, dragPointToPreview, editable, onMoveTask]);

  function beginCreateHold(day: Date, event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !editable ||
      !event.isPrimary ||
      event.button !== 0 ||
      isSwipeClickSuppressed() ||
      (event.target instanceof Element && event.target.closest("[data-task-card]"))
    ) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const y = clamp(event.clientY - rect.top, 0, bodyHeight);
    const rawMinutes = (y / HOUR_HEIGHT) * 60;
    const roundedMinutes =
      Math.round(rawMinutes / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
    const start = dateAtSlot(day, roundedMinutes);

    cancelCreateHold();
    createHoldSessionRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      timer: setTimeout(() => {
        createHoldSessionRef.current = null;
        suppressClickUntilRef.current = Date.now() + 500;
        onCreate(start, addMinutes(start, 60));
      }, CREATE_HOLD_DELAY_MS),
    };
  }

  function handleTimeScroll(event: UIEvent<HTMLDivElement>) {
    syncTimeScrollTop(event.currentTarget.scrollTop, event.currentTarget);
  }

  function handleHorizontalScroll(event: UIEvent<HTMLDivElement>) {
    syncHorizontalScrollLeft(
      event.currentTarget.scrollLeft,
      event.currentTarget,
    );
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

    const maxScrollLeft = Math.max(
      0,
      event.currentTarget.scrollWidth - event.currentTarget.clientWidth,
    );
    const canScrollInsideCalendar =
      (horizontalDelta > 0 &&
        event.currentTarget.scrollLeft < maxScrollLeft - 2) ||
      (horizontalDelta < 0 && event.currentTarget.scrollLeft > 2);

    if (canScrollInsideCalendar) {
      wheelDeltaRef.current = 0;
      wheelOffsetRef.current = 0;
      setWheelOffset(0);
      return;
    }

    event.preventDefault();
    syncHorizontalScrollLeft(horizontalDelta > 0 ? maxScrollLeft : 0);
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
    onDateChange(addDays(currentDate, direction * WEEK_SWIPE_DAY_STEP));
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
    if (!editable || task.source === "google" || task.isAllDay || event.button !== 0) {
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
    if (
      (!editable && task.source !== "google") ||
      Date.now() < suppressClickUntilRef.current
    ) {
      return;
    }

    onEdit(task);
  }

  function renderWeekPage(
    page: { dayOffset: number; days: Date[] },
    pageIndex: number,
  ) {
    const isCurrentPage = page.dayOffset === 0;

    return (
      <div
        key={page.dayOffset}
        aria-hidden={!isCurrentPage}
        className={`w-full shrink-0 ${isCurrentPage ? "" : "pointer-events-none opacity-80"}`}
      >
        <div
          ref={(node) => setHorizontalScrollNode(pageIndex, node)}
          className="planner-scroll week-horizontal-scroll overflow-x-auto"
          onScroll={handleHorizontalScroll}
          onWheel={isCurrentPage ? handleWheel : undefined}
        >
          <div className="week-table min-w-[968px]">
            <div className="grid grid-cols-[72px_repeat(7,minmax(128px,1fr))] border-b border-[color:var(--planner-border)] bg-[color:var(--planner-surface)]">
              <div className="border-r border-[color:var(--planner-border)]" />
              {page.days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`min-h-20 border-r border-[color:var(--planner-border)] px-3 py-3 last:border-r-0 ${
                    isSameDay(day, new Date()) ? "bg-mint-500/10" : ""
                  }`}
                >
                  <div className="text-xs font-bold text-[color:var(--planner-soft)]">
                    {format(day, "EEE", { locale: ja })}
                  </div>
                  <div className="mt-1 text-2xl font-bold">
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-[72px_repeat(7,minmax(128px,1fr))] border-b border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]">
              <div className="border-r border-[color:var(--planner-border)] px-2 py-3 text-right text-xs font-bold text-[color:var(--planner-soft)]">
                終日
              </div>
              {page.days.map((day) => {
                const allDayTasks = allDayTasksForDay(tasks, day);
                const visibleAllDayTasks = allDayTasks.slice(0, 3);
                const hiddenAllDayCount =
                  allDayTasks.length - visibleAllDayTasks.length;

                return (
                  <div
                    key={`all-day-${day.toISOString()}`}
                    className={`min-h-[68px] border-r border-[color:var(--planner-border)] p-2 last:border-r-0 ${
                      isSameDay(day, new Date()) ? "bg-mint-500/10" : ""
                    }`}
                  >
                    <div className="grid max-h-[132px] gap-1.5 overflow-y-auto pr-1 planner-scroll">
                      {visibleAllDayTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          compact
                          readOnly={!editable && task.source !== "google"}
                          onClick={handleTaskClick}
                        />
                      ))}
                      {hiddenAllDayCount > 0 ? (
                        <div className="rounded-md bg-[color:var(--planner-surface)] px-2 py-1 text-xs font-bold text-[color:var(--planner-soft)]">
                          +{hiddenAllDayCount}件
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              ref={(node) => setTimeScrollNode(pageIndex, node)}
              className="planner-scroll week-time-scroll overflow-y-auto overflow-x-hidden"
              onScroll={handleTimeScroll}
            >
              <div
                ref={isCurrentPage ? gridRef : undefined}
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

                {page.days.map((day, dayIndex) => {
                  const dayTasks = tasksForDay(tasks, day);
                  const timedTasks = dayTasks.filter((task) => !task.isAllDay);
                  const laidOutTasks = layoutTimedTasks(timedTasks);

                  return (
                    <div
                      key={day.toISOString()}
                      className="planner-grid-paper relative border-r border-[color:var(--planner-border)] last:border-r-0"
                      style={{ height: bodyHeight }}
                      onPointerDown={
                        isCurrentPage && editable
                          ? (event) => beginCreateHold(day, event)
                          : undefined
                      }
                    >
                      {isCurrentPage && dragPreview?.dayIndex === dayIndex ? (
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
                        const isDense =
                          layout.laneCount > 1 || layout.height < 76;
                        const isDragging =
                          isCurrentPage &&
                          dragPreview?.task.id === layout.task.id;

                        return (
                          <TaskCard
                            key={layout.task.id}
                            task={layout.task}
                            compact={isDense}
                            isDragging={isDragging}
                            readOnly={!editable && layout.task.source !== "google"}
                            style={{
                              position: "absolute",
                              top: layout.top,
                              left: `calc(${layout.lane * laneWidth}% + 6px)`,
                              width: `calc(${laneWidth}% - 10px)`,
                              height: layout.height,
                              zIndex: 10 + layout.lane,
                            }}
                            onClick={handleTaskClick}
                            onPointerDown={
                              isCurrentPage &&
                              editable &&
                              layout.task.source !== "google"
                                ? beginTaskDrag
                                : undefined
                            }
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
    );
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
            className="week-gesture-layer flex"
            style={{
              transform: `translate3d(calc(-100% + ${wheelOffset + swipeOffset}px), 0, 0)`,
            }}
            {...swipeHandlers}
          >
            {weekPages.map(renderWeekPage)}
          </div>
        </div>
      </div>
    </section>
  );
}

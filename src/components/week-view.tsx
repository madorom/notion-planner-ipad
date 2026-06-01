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
  startOfDay,
} from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PointerEvent as ReactPointerEvent, UIEvent } from "react";
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
  hourLabel,
  tasksForDay,
} from "@/lib/calendar";
import {
  DEFAULT_ALL_DAY_ROW_HEIGHT,
  clampAllDayRowHeight,
} from "@/lib/storage";
import type { AllDayRowHeights, AllDayRowId, PlannerTask } from "@/lib/types";
import { TaskCard } from "@/components/task-card";
import { clamp } from "@/lib/utils";

type WeekViewProps = {
  currentDate: Date;
  scrollRequestKey: number;
  tasks: PlannerTask[];
  editable: boolean;
  showAllDayTasks: boolean;
  hiddenAllDayRowIds: AllDayRowId[];
  allDayRowHeights: AllDayRowHeights;
  splitAllDayNotionConfigIds: string[];
  weekVisibleDays: number;
  onToggleAllDayTasks: () => void;
  onToggleAllDayRow: (rowId: AllDayRowId) => void;
  onAllDayRowHeightChange: (rowId: AllDayRowId, height: number) => void;
  onCreate: (start: Date, end: Date) => void;
  onEdit: (task: PlannerTask) => void;
  onDateChange: (date: Date) => void;
  onVisibleDateChange: (date: Date) => void;
  onMoveTask: (task: PlannerTask, start: Date, end: Date) => void;
};

const hours = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, index) => DAY_START_HOUR + index,
);
const TIME_AXIS_WIDTH = 72;
const DATE_HEADER_HEIGHT = 84;
const ALL_DAY_COLLAPSED_ROW_HEIGHT = 34;
const GRID_SCROLLBAR_GUTTER = 10;
const TIMED_TASK_GAP = 4;
const MIN_TIMED_TASK_HEIGHT = 18;
const DRAG_START_DISTANCE = 8;
const DRAG_SNAP_MINUTES = 15;
const CREATE_HOLD_DELAY_MS = 260;
const CREATE_HOLD_MOVE_TOLERANCE = 10;
const CONTINUOUS_PAST_DAYS = 21;
const CONTINUOUS_FUTURE_DAYS = 42;
const CONTINUOUS_SHIFT_DAYS = 7;
const CONTINUOUS_EDGE_DAYS = 8;

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

type AllDayResizeSession = {
  rowId: AllDayRowId;
  pointerId: number;
  startClientY: number;
  startHeight: number;
};

type AllDayRow = {
  id: AllDayRowId;
  label: string;
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

function timedTaskHeight(durationMinutes: number) {
  const rawHeight = (durationMinutes / 60) * HOUR_HEIGHT;
  return Math.max(MIN_TIMED_TASK_HEIGHT, rawHeight - TIMED_TASK_GAP);
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
    height: timedTaskHeight(endMinute - startMinute),
    lane: 0,
    laneCount: 1,
  };
}

function assignLanes(group: LayoutTask[]) {
  const laneEnds: number[] = [];

  for (const item of group) {
    const availableLane = laneEnds.findIndex(
      (endMinute) => endMinute <= item.startMinute,
    );
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

function columnWidthFor(node: HTMLDivElement, dayCount: number) {
  return node.scrollWidth / dayCount;
}

export function WeekView({
  currentDate,
  scrollRequestKey,
  tasks,
  editable,
  showAllDayTasks,
  hiddenAllDayRowIds,
  allDayRowHeights,
  splitAllDayNotionConfigIds,
  weekVisibleDays,
  onToggleAllDayTasks,
  onToggleAllDayRow,
  onAllDayRowHeightChange,
  onCreate,
  onEdit,
  onDateChange,
  onVisibleDateChange,
  onMoveTask,
}: WeekViewProps) {
  const anchorDate = useMemo(() => startOfDay(currentDate), [currentDate]);
  const days = useMemo(
    () =>
      Array.from(
        { length: CONTINUOUS_PAST_DAYS + CONTINUOUS_FUTURE_DAYS + 1 },
        (_, index) => addDays(anchorDate, index - CONTINUOUS_PAST_DAYS),
      ),
    [anchorDate],
  );
  const bodyHeight = hours.length * HOUR_HEIGHT;
  const visibleDayCount = clamp(weekVisibleDays, 1, 7);
  const allDayTaskCount = useMemo(
    () => tasks.filter((task) => task.isAllDay).length,
    [tasks],
  );
  const splitAllDayNotionConfigSet = useMemo(
    () => new Set(splitAllDayNotionConfigIds),
    [splitAllDayNotionConfigIds],
  );
  const showSplitAllDayRow =
    showAllDayTasks && splitAllDayNotionConfigSet.size > 0;
  const hiddenAllDayRowSet = useMemo(
    () => new Set(hiddenAllDayRowIds),
    [hiddenAllDayRowIds],
  );
  const allDayRows = useMemo<AllDayRow[]>(() => {
    const rows: AllDayRow[] = [{ id: "default", label: "終日" }];

    if (showSplitAllDayRow) {
      rows.push({ id: "split", label: "DB終日" });
    }

    return rows;
  }, [showSplitAllDayRow]);
  const tableStyle = {
    width: `${(days.length / visibleDayCount) * 100}%`,
  };
  const gridTemplateColumns = `repeat(${days.length}, minmax(0, 1fr))`;
  const alignedGridStyle = {
    gridTemplateColumns,
    paddingRight: GRID_SCROLLBAR_GUTTER,
  };
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const bottomHorizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const timeScrollRef = useRef<HTMLDivElement | null>(null);
  const fixedTimeAxisRef = useRef<HTMLDivElement | null>(null);
  const timeScrollTopRef = useRef(0);
  const initializedScrollRef = useRef(false);
  const pendingScrollAdjustmentRef = useRef(0);
  const isRepositioningRef = useRef(false);
  const isSyncingHorizontalScrollRef = useRef(false);
  const previousVisibleDayCountRef = useRef(visibleDayCount);
  const previousCurrentDateKeyRef = useRef(format(anchorDate, "yyyy-MM-dd"));
  const previousScrollRequestKeyRef = useRef(scrollRequestKey);
  const lastWindowShiftAtRef = useRef(0);
  const lastVisibleDateKeyRef = useRef("");
  const dragSessionRef = useRef<DragSession | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);
  const createHoldSessionRef = useRef<CreateHoldSession | null>(null);
  const allDayResizeSessionRef = useRef<AllDayResizeSession | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  const allDayRowHeight = useCallback(
    (rowId: AllDayRowId) =>
      clampAllDayRowHeight(
        allDayRowHeights[rowId] ?? DEFAULT_ALL_DAY_ROW_HEIGHT,
      ),
    [allDayRowHeights],
  );

  const allDayRowsForDay = useCallback(
    (day: Date) => {
      const allDayTasks = allDayTasksForDay(tasks, day);

      const splitTasks = allDayTasks.filter(
        (task) =>
          task.source === "notion" &&
          task.notionDataSourceId &&
          splitAllDayNotionConfigSet.has(task.notionDataSourceId),
      );
      const mainTasks = allDayTasks.filter(
        (task) =>
          task.source !== "notion" ||
          !task.notionDataSourceId ||
          !splitAllDayNotionConfigSet.has(task.notionDataSourceId),
      );

      return {
        default: showSplitAllDayRow ? mainTasks : allDayTasks,
        split: showSplitAllDayRow ? splitTasks : [],
      } satisfies Record<AllDayRowId, PlannerTask[]>;
    },
    [showSplitAllDayRow, splitAllDayNotionConfigSet, tasks],
  );

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
      const dayWidth = rect.width / days.length;
      const relativeX = clientX - rect.left;
      const dayIndex = clamp(Math.floor(relativeX / dayWidth), 0, days.length - 1);
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
        height: timedTaskHeight(durationMinutes),
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

  useEffect(() => {
    function handleAllDayResizeMove(event: PointerEvent) {
      const session = allDayResizeSessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      event.preventDefault();
      onAllDayRowHeightChange(
        session.rowId,
        session.startHeight + event.clientY - session.startClientY,
      );
    }

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
      const resizeSession = allDayResizeSessionRef.current;
      if (resizeSession?.pointerId === event.pointerId) {
        allDayResizeSessionRef.current = null;
        suppressClickUntilRef.current = Date.now() + 250;
      }

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

    window.addEventListener("pointermove", handleAllDayResizeMove, true);
    window.addEventListener("pointermove", handlePointerMove, true);
    window.addEventListener("pointermove", handleCreateHoldMove, true);
    window.addEventListener("pointerup", finishPointerDrag, true);
    window.addEventListener("pointercancel", finishPointerDrag, true);

    return () => {
      cancelCreateHold();
      window.removeEventListener("pointermove", handleAllDayResizeMove, true);
      window.removeEventListener("pointermove", handlePointerMove, true);
      window.removeEventListener("pointermove", handleCreateHoldMove, true);
      window.removeEventListener("pointerup", finishPointerDrag, true);
      window.removeEventListener("pointercancel", finishPointerDrag, true);
    };
  }, [
    cancelCreateHold,
    dragPointToPreview,
    editable,
    onAllDayRowHeightChange,
    onMoveTask,
  ]);

  function shiftDateWindow(direction: -1 | 1, columnWidth: number) {
    const now = Date.now();
    if (now - lastWindowShiftAtRef.current < 120 || isRepositioningRef.current) {
      return;
    }

    lastWindowShiftAtRef.current = now;
    isRepositioningRef.current = true;
    pendingScrollAdjustmentRef.current +=
      -direction * CONTINUOUS_SHIFT_DAYS * columnWidth;
    onDateChange(addDays(currentDate, direction * CONTINUOUS_SHIFT_DAYS));
  }

  function syncHorizontalScrollbar(
    scrollLeft: number,
    source?: HTMLDivElement | null,
  ) {
    const targets = [
      horizontalScrollRef.current,
      bottomHorizontalScrollRef.current,
    ];

    isSyncingHorizontalScrollRef.current = true;
    for (const target of targets) {
      if (!target || target === source) {
        continue;
      }

      if (Math.abs(target.scrollLeft - scrollLeft) > 1) {
        target.scrollLeft = scrollLeft;
      }
    }

    window.requestAnimationFrame(() => {
      isSyncingHorizontalScrollRef.current = false;
    });
  }

  const reportVisibleDate = useCallback(
    (node: HTMLDivElement, columnWidth: number) => {
      const dayIndex = clamp(
        Math.floor(node.scrollLeft / columnWidth + 0.05),
        0,
        days.length - 1,
      );
      const visibleDate = days[dayIndex];
      const visibleDateKey = format(visibleDate, "yyyy-MM-dd");

      if (visibleDateKey === lastVisibleDateKeyRef.current) {
        return;
      }

      lastVisibleDateKeyRef.current = visibleDateKey;
      onVisibleDateChange(visibleDate);
    },
    [days, onVisibleDateChange],
  );

  function updateHorizontalPosition(node: HTMLDivElement) {
    const columnWidth = columnWidthFor(node, days.length);
    reportVisibleDate(node, columnWidth);
    syncHorizontalScrollbar(node.scrollLeft, node);

    const edgeDistance = columnWidth * CONTINUOUS_EDGE_DAYS;
    const maxScrollLeft = node.scrollWidth - node.clientWidth;

    if (node.scrollLeft < edgeDistance) {
      shiftDateWindow(-1, columnWidth);
      return;
    }

    if (maxScrollLeft - node.scrollLeft < edgeDistance) {
      shiftDateWindow(1, columnWidth);
    }
  }

  function handleHorizontalScroll(event: UIEvent<HTMLDivElement>) {
    if (isRepositioningRef.current || isSyncingHorizontalScrollRef.current) {
      return;
    }

    updateHorizontalPosition(event.currentTarget);
  }

  function handleBottomHorizontalScroll(event: UIEvent<HTMLDivElement>) {
    if (isRepositioningRef.current || isSyncingHorizontalScrollRef.current) {
      return;
    }

    updateHorizontalPosition(event.currentTarget);
  }

  useLayoutEffect(() => {
    const horizontalScroll = horizontalScrollRef.current;
    if (!horizontalScroll) {
      return;
    }

    const columnWidth = columnWidthFor(horizontalScroll, days.length);
    const currentDateKey = format(anchorDate, "yyyy-MM-dd");

    if (!initializedScrollRef.current) {
      horizontalScroll.scrollLeft = CONTINUOUS_PAST_DAYS * columnWidth;
      initializedScrollRef.current = true;
    } else if (pendingScrollAdjustmentRef.current !== 0) {
      horizontalScroll.scrollLeft += pendingScrollAdjustmentRef.current;
      pendingScrollAdjustmentRef.current = 0;
    } else if (previousScrollRequestKeyRef.current !== scrollRequestKey) {
      const currentDateIndex = days.findIndex(
        (day) => format(day, "yyyy-MM-dd") === currentDateKey,
      );
      if (currentDateIndex >= 0) {
        horizontalScroll.scrollLeft = currentDateIndex * columnWidth;
      }
    } else if (previousVisibleDayCountRef.current !== visibleDayCount) {
      const visibleDateIndex = days.findIndex(
        (day) => format(day, "yyyy-MM-dd") === lastVisibleDateKeyRef.current,
      );
      if (visibleDateIndex >= 0) {
        horizontalScroll.scrollLeft = visibleDateIndex * columnWidth;
      }
    } else if (previousCurrentDateKeyRef.current !== currentDateKey) {
      const currentDateIndex = days.findIndex(
        (day) => format(day, "yyyy-MM-dd") === currentDateKey,
      );
      if (currentDateIndex >= 0) {
        horizontalScroll.scrollLeft = currentDateIndex * columnWidth;
      }
    }
    previousVisibleDayCountRef.current = visibleDayCount;
    previousCurrentDateKeyRef.current = currentDateKey;
    previousScrollRequestKeyRef.current = scrollRequestKey;

    syncHorizontalScrollbar(horizontalScroll.scrollLeft, horizontalScroll);

    const timeScroll = timeScrollRef.current;
    if (timeScroll && Math.abs(timeScroll.scrollTop - timeScrollTopRef.current) > 1) {
      timeScroll.scrollTop = timeScrollTopRef.current;
    }
    if (fixedTimeAxisRef.current) {
      fixedTimeAxisRef.current.style.transform = `translate3d(0, -${timeScrollTopRef.current}px, 0)`;
    }

    window.requestAnimationFrame(() => {
      reportVisibleDate(
        horizontalScroll,
        columnWidthFor(horizontalScroll, days.length),
      );
      isRepositioningRef.current = false;
    });
  }, [
    anchorDate,
    currentDate,
    days,
    days.length,
    reportVisibleDate,
    scrollRequestKey,
    hiddenAllDayRowIds,
    showAllDayTasks,
    showSplitAllDayRow,
    visibleDayCount,
  ]);

  function beginCreateHold(day: Date, event: ReactPointerEvent<HTMLDivElement>) {
    if (
      !editable ||
      !event.isPrimary ||
      event.button !== 0 ||
      Date.now() < suppressClickUntilRef.current ||
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
    timeScrollTopRef.current = event.currentTarget.scrollTop;
    if (fixedTimeAxisRef.current) {
      fixedTimeAxisRef.current.style.transform = `translate3d(0, -${event.currentTarget.scrollTop}px, 0)`;
    }
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
    if (Date.now() < suppressClickUntilRef.current) {
      return;
    }

    onEdit(task);
  }

  function beginAllDayRowResize(
    rowId: AllDayRowId,
    height: number,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    allDayResizeSessionRef.current = {
      rowId,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startHeight: height,
    };
  }

  return (
    <section className="relative isolate mx-auto max-w-[1500px] px-4 py-4 md:px-6">
      <div className="relative overflow-hidden rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] shadow-planner">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-20 bg-[color:var(--planner-surface)] shadow-[8px_0_16px_rgba(15,23,42,0.08)]"
          style={{ width: TIME_AXIS_WIDTH }}
        >
          <div
            className="flex items-end justify-end border-b border-r border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-2"
            style={{ height: DATE_HEADER_HEIGHT }}
          >
            <button
              type="button"
              aria-label={showAllDayTasks ? "終日予定を隠す" : "終日予定を表示"}
              onClick={onToggleAllDayTasks}
              className="pointer-events-auto inline-flex min-h-9 items-center gap-1 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] px-2 text-xs font-bold text-[color:var(--planner-soft)] transition active:scale-[0.98]"
            >
              {showAllDayTasks ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span>終日</span>
              {allDayTaskCount > 0 ? (
                <span className="rounded-full bg-[color:var(--planner-surface)] px-1.5 py-0.5 text-[10px]">
                  {allDayTaskCount}
                </span>
              ) : null}
            </button>
          </div>
          {showAllDayTasks
            ? allDayRows.map((row) => {
                const rowHidden = hiddenAllDayRowSet.has(row.id);
                const rowHeight = rowHidden
                  ? ALL_DAY_COLLAPSED_ROW_HEIGHT
                  : allDayRowHeight(row.id);

                return (
                  <div
                    key={`fixed-${row.id}`}
                    className="relative border-b border-r border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] p-1.5 text-right text-xs font-bold text-[color:var(--planner-soft)]"
                    style={{ height: rowHeight }}
                  >
                    <button
                      type="button"
                      aria-label={`${row.label}行を${rowHidden ? "表示" : "非表示"}`}
                      onClick={() => onToggleAllDayRow(row.id)}
                      className="pointer-events-auto inline-flex min-h-7 max-w-full items-center justify-end gap-1 rounded-md px-1.5 transition active:scale-[0.98]"
                    >
                      {rowHidden ? (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span className="truncate">{row.label}</span>
                    </button>
                    {rowHidden ? null : (
                      <div
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`${row.label}行の高さを変更`}
                        onPointerDown={(event) =>
                          beginAllDayRowResize(row.id, rowHeight, event)
                        }
                        className="pointer-events-auto absolute inset-x-1 bottom-0 flex h-4 cursor-row-resize touch-none items-end justify-center pb-0.5"
                      >
                        <span className="h-1 w-9 rounded-full bg-[color:var(--planner-border)]" />
                      </div>
                    )}
                  </div>
                );
              })
            : null}
          <div className="week-time-scroll overflow-hidden border-r border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]">
            <div
              ref={fixedTimeAxisRef}
              className="will-change-transform"
              style={{ height: bodyHeight }}
            >
              {hours.map((hour) => (
                <div
                  key={`fixed-${hour}`}
                  className="border-b border-[color:var(--planner-border)] pr-2 pt-2 text-right text-xs font-semibold text-[color:var(--planner-soft)]"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {hourLabel(hour)}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div
          ref={horizontalScrollRef}
          className="planner-scroll week-horizontal-scroll overflow-x-auto"
          onScroll={handleHorizontalScroll}
          style={{ marginLeft: TIME_AXIS_WIDTH }}
        >
          <div className="week-table" style={tableStyle}>
            <div
              className="grid border-b border-[color:var(--planner-border)] bg-[color:var(--planner-surface)]"
              style={alignedGridStyle}
            >
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`min-h-20 border-r border-[color:var(--planner-border)] px-3 py-3 last:border-r-0 ${
                    isSameDay(day, new Date()) ? "bg-mint-500/10" : ""
                  }`}
                  style={{ height: DATE_HEADER_HEIGHT }}
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

            {showAllDayTasks
              ? allDayRows.map((row) => {
                  const rowHidden = hiddenAllDayRowSet.has(row.id);
                  const rowHeight = rowHidden
                    ? ALL_DAY_COLLAPSED_ROW_HEIGHT
                    : allDayRowHeight(row.id);

                  return (
                    <div
                      key={`all-day-row-${row.id}`}
                      className="grid border-b border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]"
                      style={alignedGridStyle}
                    >
                      {days.map((day) => {
                        const allDayRows = allDayRowsForDay(day);
                        const rowTasks = rowHidden
                          ? []
                          : (allDayRows[row.id] ?? []);
                        const visibleAllDayTasks = rowTasks.slice(0, 3);
                        const hiddenAllDayCount =
                          rowTasks.length - visibleAllDayTasks.length;

                        return (
                          <div
                            key={`all-day-${row.id}-${day.toISOString()}`}
                            className={`border-r border-[color:var(--planner-border)] p-2 last:border-r-0 ${
                              isSameDay(day, new Date()) ? "bg-mint-500/10" : ""
                            }`}
                            style={{ height: rowHeight }}
                          >
                            {rowHidden ? null : (
                              <div
                                className="grid gap-1.5 overflow-y-auto pr-1 planner-scroll"
                                style={{ maxHeight: rowHeight - 16 }}
                              >
                                {visibleAllDayTasks.map((task) => (
                                  <TaskCard
                                    key={task.id}
                                    task={task}
                                    compact
                                    readOnly={
                                      !editable && task.source !== "google"
                                    }
                                    onClick={handleTaskClick}
                                  />
                                ))}
                                {hiddenAllDayCount > 0 ? (
                                  <div className="rounded-md bg-[color:var(--planner-surface)] px-2 py-1 text-xs font-bold text-[color:var(--planner-soft)]">
                                    +{hiddenAllDayCount}件
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              : null}

            <div
              ref={timeScrollRef}
              className="planner-scroll week-time-scroll overflow-y-auto overflow-x-hidden"
              onScroll={handleTimeScroll}
            >
              <div
                ref={gridRef}
                className="grid"
                style={{ minHeight: bodyHeight, gridTemplateColumns }}
              >
                {days.map((day, dayIndex) => {
                  const dayTasks = tasksForDay(tasks, day);
                  const timedTasks = dayTasks.filter((task) => !task.isAllDay);
                  const laidOutTasks = layoutTimedTasks(timedTasks);

                  return (
                    <div
                      key={day.toISOString()}
                      className="planner-grid-paper relative border-r border-[color:var(--planner-border)] last:border-r-0"
                      style={{ height: bodyHeight }}
                      onPointerDown={
                        editable ? (event) => beginCreateHold(day, event) : undefined
                      }
                    >
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
                        const isDense =
                          layout.laneCount > 1 || layout.height < 76;
                        const isDragging =
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
                              editable && layout.task.source !== "google"
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
        <div
          className="border-t border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-0 py-1.5"
          style={{ marginLeft: TIME_AXIS_WIDTH }}
        >
          <div
            ref={bottomHorizontalScrollRef}
            aria-label="日付横スクロール"
            className="planner-scroll week-bottom-horizontal-scroll overflow-x-auto overflow-y-hidden"
            onScroll={handleBottomHorizontalScroll}
          >
            <div style={{ ...tableStyle, height: 1 }} />
          </div>
        </div>
      </div>
    </section>
  );
}

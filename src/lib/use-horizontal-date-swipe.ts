"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { clamp } from "@/lib/utils";

const SWIPE_ACTIVATE_DISTANCE = 14;
const SWIPE_COMMIT_DISTANCE = 76;
const SWIPE_COMMIT_RATIO = 0.16;
const SWIPE_MAX_OFFSET = 132;
const SUPPRESS_CLICK_MS = 450;

type SwipeDirection = -1 | 1;

type SwipeSession = {
  pointerId?: number;
  input: "pointer" | "touch";
  startX: number;
  startY: number;
  offset: number;
  active: boolean;
  cancelled: boolean;
};

type UseHorizontalDateSwipeOptions = {
  onSwipe: (direction: SwipeDirection) => void;
  disabled?: boolean;
};

function isSwipeIgnored(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(target.closest("input, select, textarea, [data-no-date-swipe]"))
    : true;
}

export function useHorizontalDateSwipe({
  onSwipe,
  disabled,
}: UseHorizontalDateSwipeOptions) {
  const sessionRef = useRef<SwipeSession | null>(null);
  const suppressClickUntilRef = useRef(0);
  const [offset, setOffset] = useState(0);

  const reset = useCallback(() => {
    sessionRef.current = null;
    setOffset(0);
  }, []);

  useEffect(() => reset, [reset]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        disabled ||
        event.pointerType === "touch" ||
        !event.isPrimary ||
        event.button !== 0 ||
        isSwipeIgnored(event.target)
      ) {
        return;
      }

      sessionRef.current = {
        pointerId: event.pointerId,
        input: "pointer",
        startX: event.clientX,
        startY: event.clientY,
        offset: 0,
        active: false,
        cancelled: false,
      };
    },
    [disabled],
  );

  const updateSession = useCallback(
    (
      clientX: number,
      clientY: number,
      preventDefault: () => void,
      capturePointer?: () => void,
    ) => {
      const session = sessionRef.current;
      if (disabled || !session || session.cancelled) {
        return;
      }

      const deltaX = clientX - session.startX;
      const deltaY = clientY - session.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!session.active) {
        if (Math.hypot(deltaX, deltaY) < SWIPE_ACTIVATE_DISTANCE) {
          return;
        }

        if (absY > absX * 1.15) {
          session.cancelled = true;
          return;
        }

        session.active = true;
        capturePointer?.();
      }

      preventDefault();
      session.offset = clamp(deltaX, -SWIPE_MAX_OFFSET, SWIPE_MAX_OFFSET);
      setOffset(session.offset);
    },
    [disabled],
  );

  const finishSession = useCallback(
    (width: number) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }

      const commitDistance = Math.min(
        SWIPE_COMMIT_DISTANCE,
        Math.max(48, width * SWIPE_COMMIT_RATIO),
      );
      const shouldSwipe =
        session.active && Math.abs(session.offset) >= commitDistance;
      const direction: SwipeDirection = session.offset < 0 ? 1 : -1;

      reset();

      if (shouldSwipe) {
        suppressClickUntilRef.current = Date.now() + SUPPRESS_CLICK_MS;
        onSwipe(direction);
      }
    },
    [onSwipe, reset],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (
        !session ||
        session.input !== "pointer" ||
        event.pointerId !== session.pointerId
      ) {
        return;
      }

      updateSession(
        event.clientX,
        event.clientY,
        () => event.preventDefault(),
        () => event.currentTarget.setPointerCapture(event.pointerId),
      );
    },
    [updateSession],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (
        !session ||
        session.input !== "pointer" ||
        event.pointerId !== session.pointerId
      ) {
        return;
      }

      finishSession(event.currentTarget.clientWidth);
    },
    [finishSession],
  );

  const onTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      if (
        disabled ||
        event.touches.length !== 1 ||
        isSwipeIgnored(event.target)
      ) {
        return;
      }

      const touch = event.touches[0];
      sessionRef.current = {
        input: "touch",
        startX: touch.clientX,
        startY: touch.clientY,
        offset: 0,
        active: false,
        cancelled: false,
      };
    },
    [disabled],
  );

  const onTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.input !== "touch" || event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      updateSession(
        touch.clientX,
        touch.clientY,
        () => event.preventDefault(),
      );
    },
    [updateSession],
  );

  const finishTouch = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || session.input !== "touch") {
        return;
      }

      finishSession(event.currentTarget.clientWidth);
    },
    [finishSession],
  );

  const isClickSuppressed = useCallback(
    () => Date.now() < suppressClickUntilRef.current,
    [],
  );

  return {
    offset,
    isClickSuppressed,
    swipeHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishPointer,
      onPointerCancel: reset,
      onTouchStart,
      onTouchMove,
      onTouchEnd: finishTouch,
      onTouchCancel: reset,
    },
  };
}

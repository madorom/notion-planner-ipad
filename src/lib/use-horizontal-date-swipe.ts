"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clamp } from "@/lib/utils";

const SWIPE_ACTIVATE_DISTANCE = 14;
const SWIPE_COMMIT_DISTANCE = 76;
const SWIPE_COMMIT_RATIO = 0.16;
const SWIPE_MAX_OFFSET = 132;
const SUPPRESS_CLICK_MS = 450;

type SwipeDirection = -1 | 1;

type SwipeSession = {
  pointerId: number;
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
        !event.isPrimary ||
        event.button !== 0 ||
        isSwipeIgnored(event.target)
      ) {
        return;
      }

      sessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offset: 0,
        active: false,
        cancelled: false,
      };
    },
    [disabled],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (
        disabled ||
        !session ||
        session.cancelled ||
        event.pointerId !== session.pointerId
      ) {
        return;
      }

      const deltaX = event.clientX - session.startX;
      const deltaY = event.clientY - session.startY;
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
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      event.preventDefault();
      session.offset = clamp(deltaX, -SWIPE_MAX_OFFSET, SWIPE_MAX_OFFSET);
      setOffset(session.offset);
    },
    [disabled],
  );

  const finish = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const session = sessionRef.current;
      if (!session || event.pointerId !== session.pointerId) {
        return;
      }

      const width = event.currentTarget.clientWidth;
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
      onPointerUp: finish,
      onPointerCancel: reset,
    },
  };
}

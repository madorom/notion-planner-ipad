"use client";

import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { CalendarClock, ExternalLink, Paperclip, PencilLine, X } from "lucide-react";
import type { PlannerTask } from "@/lib/types";
import { IconButton } from "@/components/icon-button";
import { cx } from "@/lib/utils";

type TaskSummaryPopoverProps = {
  task: PlannerTask;
  editable: boolean;
  onClose: () => void;
  onEdit: () => void;
};

function taskTimeLabel(task: PlannerTask) {
  const start = parseISO(task.start);

  if (task.isAllDay) {
    return `${format(start, "M月d日(E)", { locale: ja })} 終日`;
  }

  const end = task.end ? parseISO(task.end) : null;
  return end
    ? `${format(start, "M月d日(E) HH:mm", { locale: ja })} - ${format(end, "HH:mm")}`
    : format(start, "M月d日(E) HH:mm", { locale: ja });
}

function NotionIcon({ task }: { task: PlannerTask }) {
  if (!task.icon) {
    return null;
  }

  if (task.icon.type === "emoji") {
    return (
      <span className="text-3xl leading-none" aria-hidden="true">
        {task.icon.value}
      </span>
    );
  }

  return (
    <span
      className="h-9 w-9 shrink-0 rounded-lg bg-cover bg-center"
      style={{ backgroundImage: `url("${task.icon.value}")` }}
      aria-hidden="true"
    />
  );
}

export function TaskSummaryPopover({
  task,
  editable,
  onClose,
  onEdit,
}: TaskSummaryPopoverProps) {
  const canOpenEditor = task.source !== "google";
  const propertySummaries =
    task.propertySummaries?.filter((property) => property.value) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-3 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[460px] rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-4 shadow-planner"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <NotionIcon task={task} />
            <div className="min-w-0">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[color:var(--planner-soft)]">
                <CalendarClock className="h-3.5 w-3.5" />
                {taskTimeLabel(task)}
              </p>
              <h2 className="break-words text-xl font-bold leading-tight">
                {task.title}
              </h2>
            </div>
          </div>
          <IconButton label="閉じる" type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="grid max-h-[56dvh] gap-3 overflow-y-auto pr-1 planner-scroll">
          {task.status ? (
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="h-2.5 w-2.5 rounded-full bg-mint-500" />
              {task.status}
            </div>
          ) : null}

          {task.memo ? (
            <p className="whitespace-pre-wrap rounded-lg bg-[color:var(--planner-surface-muted)] px-3 py-2 text-sm leading-relaxed">
              {task.memo}
            </p>
          ) : null}

          {task.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[color:var(--planner-surface-muted)] px-2.5 py-1 text-xs font-bold text-[color:var(--planner-soft)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {task.externalUrl ? (
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--planner-border)] px-3 text-sm font-bold text-mint-600"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="truncate">{task.externalUrl}</span>
            </a>
          ) : null}

          {(task.attachments ?? []).length > 0 ? (
            <div className="grid gap-1.5">
              {(task.attachments ?? []).map((attachment) => (
                <a
                  key={`${attachment.name}-${attachment.url}`}
                  href={attachment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[color:var(--planner-border)] px-3 text-sm font-bold text-mint-600"
                >
                  <Paperclip className="h-4 w-4" />
                  <span className="truncate">{attachment.name}</span>
                </a>
              ))}
            </div>
          ) : null}

          {propertySummaries.length > 0 ? (
            <div className="grid gap-1.5 border-t border-[color:var(--planner-border)] pt-3">
              {propertySummaries.map((property) => (
                <div
                  key={`${property.name}-${property.type}`}
                  className={cx(
                    "grid gap-0.5 rounded-lg border px-3 py-2 text-sm",
                    property.supported
                      ? "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)]"
                      : "border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] opacity-45",
                  )}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-[color:var(--planner-soft)]">
                    <span className="truncate">{property.name}</span>
                    <span className="font-mono">{property.type}</span>
                  </div>
                  <p className="line-clamp-2 break-words font-semibold">
                    {property.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {task.url ? (
            <a
              href={task.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--planner-border)] px-4 text-sm font-bold text-[color:var(--planner-soft)]"
            >
              <ExternalLink className="h-4 w-4" />
              {task.source === "google" ? "Google Calendar" : "Notion"}
            </a>
          ) : (
            <span />
          )}

          {canOpenEditor ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-mint-500 px-4 text-sm font-bold text-white shadow-planner-soft transition active:scale-[0.99]"
            >
              <PencilLine className="h-4 w-4" />
              {editable ? "編集へ進む" : "詳細を開く"}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

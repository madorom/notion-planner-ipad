"use client";

import { FormEvent, useMemo, useState } from "react";
import { ExternalLink, LoaderCircle, Save, X } from "lucide-react";
import {
  datetimeLocalValue,
  localInputToIso,
} from "@/lib/calendar";
import type {
  AppConfig,
  NotionOption,
  NotionPropertyType,
  PlannerTask,
  TaskInput,
} from "@/lib/types";
import { IconButton } from "@/components/icon-button";
import { cx } from "@/lib/utils";

type ModalState =
  | {
      mode: "create";
      start: Date;
      end: Date;
    }
  | {
      mode: "edit";
      task: PlannerTask;
    };

type TaskModalProps = {
  state: ModalState;
  config: AppConfig;
  saving: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (task: TaskInput, existingTask?: PlannerTask) => Promise<void>;
};

function findProperty(config: AppConfig, name?: string) {
  return config.properties.find((property) => property.name === name);
}

function optionNames(options?: NotionOption[]) {
  return options?.map((option) => option.name) ?? [];
}

function initialFromState(state: ModalState) {
  if (state.mode === "create") {
    return {
      title: "",
      start: datetimeLocalValue(state.start),
      end: datetimeLocalValue(state.end),
      status: "",
      memo: "",
      tags: "",
    };
  }

  return {
    title: state.task.title,
    start: datetimeLocalValue(state.task.start),
    end: datetimeLocalValue(state.task.end ?? state.task.start),
    status: state.task.status ?? "",
    memo: state.task.memo ?? "",
    tags: state.task.tags.join(", "),
  };
}

function extractUrls(value: string) {
  return Array.from(value.matchAll(/https?:\/\/[^\s]+/g), (match) =>
    match[0].replace(/[),.。]+$/, ""),
  );
}

function NotionIcon({ task }: { task?: PlannerTask }) {
  if (!task?.icon) {
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
      className="h-9 w-9 rounded-lg bg-cover bg-center"
      style={{ backgroundImage: `url("${task.icon.value}")` }}
      aria-hidden="true"
    />
  );
}

export function taskPropertyTypes(config: AppConfig) {
  const mapping = config.mapping;
  return {
    title: findProperty(config, mapping.title)?.type,
    date: findProperty(config, mapping.date)?.type,
    status: findProperty(config, mapping.status)?.type,
    memo: findProperty(config, mapping.memo)?.type,
    tags: findProperty(config, mapping.tags)?.type,
  } satisfies Partial<Record<keyof typeof mapping, NotionPropertyType>>;
}

export function TaskModal({
  state,
  config,
  saving,
  readOnly,
  onClose,
  onSave,
}: TaskModalProps) {
  const [form, setForm] = useState(initialFromState(state));
  const [error, setError] = useState("");

  const statusProperty = useMemo(
    () => findProperty(config, config.mapping.status),
    [config],
  );
  const statusOptions = optionNames(statusProperty?.options);
  const hasMemo = Boolean(config.mapping.memo);
  const hasTags = Boolean(config.mapping.tags);
  const existingTask = state.mode === "edit" ? state.task : undefined;
  const isSidePanel = state.mode === "edit";
  const memoUrls = extractUrls(form.memo);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) {
      return;
    }

    setError("");

    if (!form.title.trim()) {
      setError("タイトルを入力してください。");
      return;
    }

    if (!form.start) {
      setError("開始日時を入力してください。");
      return;
    }

    if (form.end && new Date(form.end) <= new Date(form.start)) {
      setError("終了日時は開始日時より後にしてください。");
      return;
    }

    await onSave(
      {
        title: form.title.trim(),
        start: localInputToIso(form.start),
        end: form.end ? localInputToIso(form.end) : undefined,
        status: form.status || undefined,
        memo: form.memo,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
      existingTask,
    );
  }

  return (
    <div
      className={cx(
        "fixed inset-0 z-50 bg-black/35 backdrop-blur-sm",
        isSidePanel
          ? "flex justify-end"
          : "flex items-end justify-center p-3 md:items-center md:p-6",
      )}
    >
      <form
        onSubmit={submit}
        className={cx(
          "w-full overflow-auto border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-5 shadow-planner md:p-6",
          isSidePanel
            ? "h-dvh max-w-[540px] rounded-none border-y-0 border-r-0"
            : "max-h-[92dvh] max-w-2xl rounded-xl",
        )}
      >
        <div
          className={cx(
            "mb-5 flex items-center justify-between gap-3",
            isSidePanel &&
              "sticky top-0 z-10 -mx-5 -mt-5 border-b border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-5 py-4 md:-mx-6 md:-mt-6 md:px-6",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <NotionIcon task={existingTask} />
            <div className="min-w-0">
            <p className="text-sm font-bold text-mint-600">
              {state.mode === "create"
                ? "新規タスク"
                : readOnly
                  ? "タスク詳細"
                  : "タスク編集"}
            </p>
            <h2 className="text-2xl font-bold">
              {state.mode === "create"
                ? "予定を追加"
                : readOnly
                  ? "内容を確認"
                  : "予定を更新"}
            </h2>
            </div>
          </div>
          <IconButton label="閉じる" type="button" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
              タイトル
            </span>
            <input
              autoFocus
              value={form.title}
              readOnly={readOnly}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              className={cx(
                "min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-lg font-semibold outline-none transition focus:border-mint-500",
                readOnly && "cursor-default bg-[color:var(--planner-surface-muted)]",
              )}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
                開始日時
              </span>
              <input
                type="datetime-local"
                value={form.start}
                readOnly={readOnly}
                onChange={(event) =>
                  setForm((current) => ({ ...current, start: event.target.value }))
                }
                className={cx(
                  "min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-base outline-none transition focus:border-mint-500",
                  readOnly && "cursor-default bg-[color:var(--planner-surface-muted)]",
                )}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
                終了日時
              </span>
              <input
                type="datetime-local"
                value={form.end}
                readOnly={readOnly}
                onChange={(event) =>
                  setForm((current) => ({ ...current, end: event.target.value }))
                }
                className={cx(
                  "min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-base outline-none transition focus:border-mint-500",
                  readOnly && "cursor-default bg-[color:var(--planner-surface-muted)]",
                )}
              />
            </label>
          </div>

          {statusProperty ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
                ステータス
              </span>
              {statusOptions.length > 0 ? (
                <select
                  value={form.status}
                  disabled={readOnly}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, status: event.target.value }))
                  }
                  className="min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-base outline-none transition focus:border-mint-500"
                >
                  <option value="">未選択</option>
                  {statusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={form.status}
                  readOnly={readOnly}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, status: event.target.value }))
                  }
                  className="min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-base outline-none transition focus:border-mint-500"
                />
              )}
            </label>
          ) : null}

          {hasMemo ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
                メモ
              </span>
              <textarea
                value={form.memo}
                readOnly={readOnly}
                onChange={(event) =>
                  setForm((current) => ({ ...current, memo: event.target.value }))
                }
                rows={4}
                className="rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 py-3 text-base outline-none transition focus:border-mint-500"
              />
              {readOnly && memoUrls.length > 0 ? (
                <div className="grid gap-1">
                  {memoUrls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[color:var(--planner-border)] px-3 text-sm font-bold text-mint-600"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="truncate">{url}</span>
                    </a>
                  ))}
                </div>
              ) : null}
            </label>
          ) : null}

          {hasTags ? (
            <label className="grid gap-2">
              <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
                タグ
              </span>
              <input
                value={form.tags}
                readOnly={readOnly}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tags: event.target.value }))
                }
                className="min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-base outline-none transition focus:border-mint-500"
              />
            </label>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-coral-500/30 bg-coral-500/10 px-4 py-3 text-sm font-semibold text-coral-500">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
          {existingTask?.url ? (
            <a
              href={existingTask.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--planner-border)] px-4 text-sm font-bold text-[color:var(--planner-soft)]"
            >
              <ExternalLink className="h-4 w-4" />
              Notion
            </a>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={saving || readOnly}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-mint-500 px-6 text-base font-bold text-white shadow-planner-soft transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <Save className="h-5 w-5" />
            )}
            {readOnly ? "閲覧中" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}

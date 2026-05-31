"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Database, LoaderCircle, RefreshCw } from "lucide-react";
import type {
  AppConfig,
  NotionDatabaseOption,
  NotionProperty,
  PropertyMapping,
  SchemaResponse,
} from "@/lib/types";
import { loadKnownConfigs, saveConfig } from "@/lib/storage";
import { cx, shortId } from "@/lib/utils";

type SetupPanelProps = {
  initialConfig: AppConfig | null;
  onReady: (config: AppConfig) => void;
};

function autoMap(properties: NotionProperty[]): PropertyMapping {
  return {
    title: properties.find((property) => property.type === "title")?.name ?? "",
    date: properties.find((property) => property.type === "date")?.name ?? "",
    status:
      properties.find((property) => property.type === "status")?.name ??
      properties.find((property) => property.type === "select")?.name,
    memo: properties.find((property) => property.type === "rich_text")?.name,
    tags: properties.find((property) => property.type === "multi_select")?.name,
  };
}

function propertyOptions(properties: NotionProperty[], types: string[]) {
  return properties.filter((property) => types.includes(property.type));
}

export function SetupPanel({ initialConfig, onReady }: SetupPanelProps) {
  const [targetId, setTargetId] = useState(
    initialConfig?.dataSourceId ?? initialConfig?.targetId ?? "",
  );
  const [knownConfigs, setKnownConfigs] = useState<AppConfig[]>([]);
  const [databaseOptions, setDatabaseOptions] = useState<NotionDatabaseOption[]>(
    [],
  );
  const [schema, setSchema] = useState<SchemaResponse | null>(
    initialConfig
      ? {
          databaseId: initialConfig.databaseId,
          dataSourceId: initialConfig.dataSourceId ?? initialConfig.targetId,
          name: initialConfig.targetName ?? "Notion database",
          properties: initialConfig.properties,
        }
      : null,
  );
  const [mapping, setMapping] = useState<PropertyMapping>(
    initialConfig?.mapping ?? {
      title: "",
      date: "",
      status: undefined,
      memo: undefined,
      tags: undefined,
    },
  );
  const [loading, setLoading] = useState(false);
  const [databasesLoading, setDatabasesLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setKnownConfigs(loadKnownConfigs());
  }, []);

  const titleProperties = useMemo(
    () => propertyOptions(schema?.properties ?? [], ["title"]),
    [schema],
  );
  const dateProperties = useMemo(
    () => propertyOptions(schema?.properties ?? [], ["date"]),
    [schema],
  );
  const statusProperties = useMemo(
    () => propertyOptions(schema?.properties ?? [], ["status", "select"]),
    [schema],
  );
  const memoProperties = useMemo(
    () => propertyOptions(schema?.properties ?? [], ["rich_text"]),
    [schema],
  );
  const tagProperties = useMemo(
    () => propertyOptions(schema?.properties ?? [], ["multi_select"]),
    [schema],
  );

  function applyConfig(nextConfig: AppConfig) {
    setTargetId(nextConfig.dataSourceId ?? nextConfig.targetId);
    setSchema({
      databaseId: nextConfig.databaseId,
      dataSourceId: nextConfig.dataSourceId ?? nextConfig.targetId,
      name: nextConfig.targetName ?? "Notion database",
      properties: nextConfig.properties,
    });
    setMapping(nextConfig.mapping);
    setError("");
  }

  async function fetchDatabases() {
    setDatabasesLoading(true);
    setError("");

    try {
      const response = await fetch("/api/notion/databases", {
        method: "POST",
        cache: "no-store",
      });
      const data = (await response.json()) as {
        databases?: NotionDatabaseOption[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Notionデータベース一覧を取得できませんでした。");
      }

      setDatabaseOptions(data.databases ?? []);

      if ((data.databases ?? []).length === 0) {
        setError("共有済みのNotionデータベースが見つかりませんでした。");
      }
    } catch (databaseError) {
      setError(
        databaseError instanceof Error
          ? databaseError.message
          : "Notionデータベース一覧を取得できませんでした。",
      );
    } finally {
      setDatabasesLoading(false);
    }
  }

  function selectDatabaseOption(dataSourceId: string) {
    setTargetId(dataSourceId);
    setSchema(null);
    setMapping({
      title: "",
      date: "",
      status: undefined,
      memo: undefined,
      tags: undefined,
    });
    setError("");
  }

  async function connect() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/notion/schema?targetId=${encodeURIComponent(targetId)}`,
      );
      const data = (await response.json()) as SchemaResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Notionデータベースへ接続できませんでした。");
      }

      setSchema(data);
      setMapping((current) => {
        const next = autoMap(data.properties);
        return {
          title: current.title || next.title,
          date: current.date || next.date,
          status: current.status || next.status,
          memo: current.memo || next.memo,
          tags: current.tags || next.tags,
        };
      });
    } catch (connectError) {
      setError(
        connectError instanceof Error
          ? connectError.message
          : "Notionデータベースへ接続できませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }

  function commit() {
    if (!schema || !mapping.title || !mapping.date) {
      setError("タイトルプロパティと日付プロパティを選択してください。");
      return;
    }

    const config: AppConfig = {
      targetId,
      targetName: schema.name,
      databaseId: schema.databaseId,
      dataSourceId: schema.dataSourceId,
      properties: schema.properties,
      mapping,
    };

    saveConfig(config);
    setKnownConfigs(loadKnownConfigs());
    onReady(config);
  }

  function MappingSelect({
    label,
    value,
    options,
    onChange,
    required,
  }: {
    label: string;
    value?: string;
    options: NotionProperty[];
    onChange: (value: string | undefined) => void;
    required?: boolean;
  }) {
    return (
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
          {label}
        </span>
        <select
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value || undefined)}
          className="min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-base outline-none transition focus:border-mint-500"
        >
          <option value="">{required ? "選択してください" : "未使用"}</option>
          {options.map((property) => (
            <option key={property.id} value={property.name}>
              {property.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl items-center px-5 py-6 md:px-8">
      <section className="w-full rounded-xl border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] p-5 shadow-planner md:p-8">
        <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-mint-600">Notion手帳</p>
            <h1 className="mt-1 text-3xl font-bold tracking-normal md:text-4xl">
              初期設定
            </h1>
          </div>
          {schema ? (
            <div className="rounded-lg border border-[color:var(--planner-border)] px-4 py-3 text-sm text-[color:var(--planner-soft)]">
              <span className="font-semibold text-[color:var(--planner-ink)]">
                {schema.name}
              </span>
              <span className="ml-2 font-mono">{shortId(schema.dataSourceId)}</span>
            </div>
          ) : null}
        </div>

        {knownConfigs.length > 0 ? (
          <div className="mb-5 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-[color:var(--planner-soft)]">
                保存済みDB
              </p>
              <span className="text-xs font-bold text-[color:var(--planner-soft)]">
                {knownConfigs.length}件
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {knownConfigs.map((knownConfig) => {
                const knownTargetId =
                  knownConfig.dataSourceId ?? knownConfig.targetId;
                const selected = knownTargetId === targetId;

                return (
                  <button
                    key={knownTargetId}
                    type="button"
                    onClick={() => applyConfig(knownConfig)}
                    className={cx(
                      "min-h-12 rounded-lg border px-3 text-left transition active:scale-[0.99]",
                      selected
                        ? "border-mint-500/50 bg-mint-500/10"
                        : "border-[color:var(--planner-border)] bg-[color:var(--planner-surface)]",
                    )}
                  >
                    <span className="block truncate text-sm font-bold">
                      {knownConfig.targetName ?? "Notion database"}
                    </span>
                    <span className="mt-1 block font-mono text-xs text-[color:var(--planner-soft)]">
                      {shortId(knownTargetId)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mb-5 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="grid flex-1 gap-2">
              <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
                共有済みNotion DB
              </span>
              <select
                value={
                  databaseOptions.some((option) => option.dataSourceId === targetId)
                    ? targetId
                    : ""
                }
                onChange={(event) => selectDatabaseOption(event.target.value)}
                className="min-h-12 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-base outline-none transition focus:border-mint-500"
              >
                <option value="">一覧から選択</option>
                {databaseOptions.map((option) => (
                  <option key={option.dataSourceId} value={option.dataSourceId}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={fetchDatabases}
              disabled={databasesLoading}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] px-4 text-sm font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {databasesLoading ? (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
              一覧取得
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="grid gap-2">
            <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
              Database ID / Data Source ID
            </span>
            <div className="relative">
              <Database className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[color:var(--planner-soft)]" />
              <input
                value={targetId}
                onChange={(event) => setTargetId(event.target.value)}
                className="min-h-12 w-full rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] py-3 pl-12 pr-4 text-base outline-none transition focus:border-mint-500"
                autoComplete="off"
              />
            </div>
          </label>

          <button
            type="button"
            onClick={connect}
            disabled={!targetId || loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-base font-bold text-white shadow-planner-soft transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-mint-500"
          >
            {loading ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
            接続
          </button>
        </div>

        {schema ? (
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <MappingSelect
              label="タイトル"
              value={mapping.title}
              options={titleProperties}
              required
              onChange={(value) => setMapping((current) => ({ ...current, title: value ?? "" }))}
            />
            <MappingSelect
              label="日付"
              value={mapping.date}
              options={dateProperties}
              required
              onChange={(value) => setMapping((current) => ({ ...current, date: value ?? "" }))}
            />
            <MappingSelect
              label="ステータス"
              value={mapping.status}
              options={statusProperties}
              onChange={(value) => setMapping((current) => ({ ...current, status: value }))}
            />
            <MappingSelect
              label="メモ"
              value={mapping.memo}
              options={memoProperties}
              onChange={(value) => setMapping((current) => ({ ...current, memo: value }))}
            />
            <MappingSelect
              label="タグ"
              value={mapping.tags}
              options={tagProperties}
              onChange={(value) => setMapping((current) => ({ ...current, tags: value }))}
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-lg border border-coral-500/30 bg-coral-500/10 px-4 py-3 text-sm font-semibold text-coral-500">
            {error}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col gap-3 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={commit}
            disabled={!schema || !mapping.title || !mapping.date}
            className={cx(
              "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-mint-500 px-6 text-base font-bold text-white shadow-planner-soft transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            <Check className="h-5 w-5" />
            保存して開く
          </button>
        </div>
      </section>
    </main>
  );
}

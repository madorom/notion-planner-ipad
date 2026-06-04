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
import { mappingValues, toggleMappingValue } from "@/lib/property-mapping";
import { loadKnownConfigs, saveConfig } from "@/lib/storage";
import { cx, shortId } from "@/lib/utils";

type SetupPanelProps = {
  initialConfig: AppConfig | null;
  onReady: (config: AppConfig) => void;
};

function autoMap(properties: NotionProperty[]): PropertyMapping {
  const urlProperties = properties.filter((property) => property.type === "url");
  const fileProperties = properties.filter(
    (property) => property.type === "files",
  );
  const relationProperties = properties.filter(
    (property) => property.type === "relation",
  );

  return {
    title: properties.find((property) => property.type === "title")?.name ?? "",
    date: properties.find((property) => property.type === "date")?.name ?? "",
    status:
      properties.find((property) => property.type === "status")?.name ??
      properties.find((property) => property.type === "select")?.name,
    memo: properties.find((property) => property.type === "rich_text")?.name,
    tags: properties.find((property) => property.type === "multi_select")?.name,
    url: urlProperties.length
      ? urlProperties.map((property) => property.name)
      : undefined,
    files: fileProperties.length
      ? fileProperties.map((property) => property.name)
      : undefined,
    relation: relationProperties.length
      ? relationProperties.map((property) => property.name)
      : undefined,
  };
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
      url: undefined,
      files: undefined,
      relation: undefined,
    },
  );
  const [loading, setLoading] = useState(false);
  const [databasesLoading, setDatabasesLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setKnownConfigs(loadKnownConfigs());
  }, []);

  const allProperties = useMemo(() => schema?.properties ?? [], [schema]);

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
      url: undefined,
      files: undefined,
      relation: undefined,
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
          url: mappingValues(current.url).length > 0 ? current.url : next.url,
          files:
            mappingValues(current.files).length > 0 ? current.files : next.files,
          relation:
            mappingValues(current.relation).length > 0
              ? current.relation
              : next.relation,
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
    properties,
    supportedTypes,
    onChange,
    required,
  }: {
    label: string;
    value?: string;
    properties: NotionProperty[];
    supportedTypes: string[];
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
          {properties.map((property) => {
            const supported = supportedTypes.includes(property.type);

            return (
              <option
                key={property.id}
                value={property.name}
                disabled={!supported}
              >
                {property.name}
                {supported ? "" : `（${property.type}は未対応）`}
              </option>
            );
          })}
        </select>
      </label>
    );
  }

  function MultiMappingSelect({
    label,
    value,
    properties,
    supportedTypes,
    onChange,
  }: {
    label: string;
    value?: string | string[];
    properties: NotionProperty[];
    supportedTypes: string[];
    onChange: (value: string[] | undefined) => void;
  }) {
    const selected = mappingValues(value);
    const selectedSet = new Set(selected);

    return (
      <div className="grid gap-2 rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[color:var(--planner-soft)]">
            {label}
          </span>
          <span className="text-xs font-bold text-[color:var(--planner-soft)]">
            {selected.length}件
          </span>
        </div>
        <div className="grid gap-2">
          {properties.map((property) => {
            const supported = supportedTypes.includes(property.type);
            const checked = selectedSet.has(property.name);

            return (
              <label
                key={property.id}
                className={cx(
                  "flex min-h-11 items-center gap-3 rounded-lg border px-3 text-sm font-semibold transition",
                  supported
                    ? checked
                      ? "border-mint-500/40 bg-mint-500/10"
                      : "border-[color:var(--planner-border)] bg-[color:var(--planner-surface)]"
                    : "border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] opacity-45",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!supported}
                  onChange={() => {
                    const next = toggleMappingValue(value, property.name);
                    onChange(next.length > 0 ? next : undefined);
                  }}
                  className="h-5 w-5 shrink-0 accent-mint-500 disabled:opacity-45"
                />
                <span className="min-w-0 flex-1 truncate">{property.name}</span>
                <span className="font-mono text-xs text-[color:var(--planner-soft)]">
                  {property.type}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <main className="relative z-50 mx-auto flex min-h-dvh w-full max-w-5xl items-center bg-[color:var(--planner-bg)] px-5 py-6 md:px-8">
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
          <div className="mt-7 grid gap-5">
            <div className="grid gap-4 md:grid-cols-2">
              <MappingSelect
                label="タイトル"
                value={mapping.title}
                properties={allProperties}
                supportedTypes={["title"]}
                required
                onChange={(value) =>
                  setMapping((current) => ({ ...current, title: value ?? "" }))
                }
              />
              <MappingSelect
                label="日付"
                value={mapping.date}
                properties={allProperties}
                supportedTypes={["date"]}
                required
                onChange={(value) =>
                  setMapping((current) => ({ ...current, date: value ?? "" }))
                }
              />
              <MappingSelect
                label="ステータス"
                value={mapping.status}
                properties={allProperties}
                supportedTypes={["status", "select"]}
                onChange={(value) =>
                  setMapping((current) => ({ ...current, status: value }))
                }
              />
              <MappingSelect
                label="メモ"
                value={mapping.memo}
                properties={allProperties}
                supportedTypes={["rich_text"]}
                onChange={(value) =>
                  setMapping((current) => ({ ...current, memo: value }))
                }
              />
              <MappingSelect
                label="タグ"
                value={mapping.tags}
                properties={allProperties}
                supportedTypes={["multi_select"]}
                onChange={(value) =>
                  setMapping((current) => ({ ...current, tags: value }))
                }
              />
              <MultiMappingSelect
                label="URL"
                value={mapping.url}
                properties={allProperties}
                supportedTypes={["url"]}
                onChange={(value) =>
                  setMapping((current) => ({ ...current, url: value }))
                }
              />
              <MultiMappingSelect
                label="添付資料"
                value={mapping.files}
                properties={allProperties}
                supportedTypes={["files"]}
                onChange={(value) =>
                  setMapping((current) => ({ ...current, files: value }))
                }
              />
              <MultiMappingSelect
                label="リレーション"
                value={mapping.relation}
                properties={allProperties}
                supportedTypes={["relation"]}
                onChange={(value) =>
                  setMapping((current) => ({ ...current, relation: value }))
                }
              />
            </div>

            <div className="rounded-lg border border-[color:var(--planner-border)] bg-[color:var(--planner-surface-muted)] p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[color:var(--planner-soft)]">
                  読み込み済みプロパティ
                </p>
                <span className="text-xs font-bold text-[color:var(--planner-soft)]">
                  {allProperties.length}件
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {allProperties.map((property) => {
                  const supported = [
                    "title",
                    "date",
                    "status",
                    "select",
                    "rich_text",
                    "multi_select",
                    "url",
                    "files",
                    "relation",
                  ].includes(property.type);

                  return (
                    <span
                      key={property.id}
                      className={cx(
                        "inline-flex min-h-8 items-center gap-2 rounded-lg border px-3 text-xs font-bold",
                        supported
                          ? "border-mint-500/30 bg-mint-500/10 text-mint-600"
                          : "border-[color:var(--planner-border)] bg-[color:var(--planner-surface)] text-[color:var(--planner-soft)] opacity-55",
                      )}
                    >
                      <span className="truncate">{property.name}</span>
                      <span className="font-mono opacity-75">{property.type}</span>
                    </span>
                  );
                })}
              </div>
            </div>
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

import type {
  NotionOption,
  NotionProperty,
  NotionPropertyType,
  PlannerTask,
  PropertyMapping,
  TaskInput,
} from "@/lib/types";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2026-03-11";

type NotionErrorBody = {
  object?: "error";
  status?: number;
  code?: string;
  message?: string;
};

type NotionPropertySchema = {
  id: string;
  name?: string;
  type: NotionPropertyType;
  select?: { options?: NotionOption[] };
  status?: { options?: NotionOption[] };
  multi_select?: { options?: NotionOption[] };
};

type NotionDataSource = {
  object: "data_source";
  id: string;
  title?: Array<{ plain_text?: string }>;
  name?: string;
  properties: Record<string, NotionPropertySchema>;
};

type NotionDatabase = {
  object: "database";
  id: string;
  title?: Array<{ plain_text?: string }>;
  data_sources?: Array<{ id: string; name?: string }>;
};

type NotionPage = {
  object: "page";
  id: string;
  url?: string;
  properties: Record<string, Record<string, unknown> & { type?: string }>;
};

type NotionQueryResponse = {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
};

type NotionBlock = {
  object: "block";
  id: string;
  type: string;
  has_children?: boolean;
  child_database?: {
    title?: string;
  };
};

type NotionBlockChildrenResponse = {
  results: NotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
};

type ChildDatabaseCandidate = {
  id: string;
  title: string;
};

export class NotionApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "NotionApiError";
    this.status = status;
    this.code = code;
  }
}

export function extractNotionId(input: string) {
  const trimmed = input.trim();
  const uuid = trimmed.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/,
  );
  if (uuid) {
    return uuid[0];
  }

  const compact = trimmed.match(/[0-9a-fA-F]{32}/);
  if (compact) {
    return compact[0];
  }

  return trimmed;
}

async function notionFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const body = (await response.json().catch(() => null)) as
    | NotionErrorBody
    | T
    | null;

  if (!response.ok) {
    const errorBody = body as NotionErrorBody | null;
    throw new NotionApiError(
      response.status,
      errorBody?.message ?? `Notion API request failed: ${response.status}`,
      errorBody?.code,
    );
  }

  return body as T;
}

async function tryNotionFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
) {
  try {
    return await notionFetch<T>(token, path, init);
  } catch (error) {
    if (error instanceof NotionApiError && [400, 404].includes(error.status)) {
      return null;
    }
    throw error;
  }
}

function plainTitle(
  richTexts?: Array<{ plain_text?: string }>,
  fallback = "Notion database",
) {
  const title = richTexts?.map((part) => part.plain_text ?? "").join("").trim();
  return title || fallback;
}

export function normalizeProperties(
  properties: Record<string, NotionPropertySchema>,
) {
  return Object.entries(properties).map(([name, property]) => {
    const options =
      property.select?.options ??
      property.status?.options ??
      property.multi_select?.options ??
      undefined;

    return {
      id: property.id,
      name,
      type: property.type,
      options,
    } satisfies NotionProperty;
  });
}

function completeMapping(
  mapping: PropertyMapping,
  properties: NotionProperty[],
): PropertyMapping {
  const preferredStatus =
    mapping.status ||
    properties.find((property) => property.type === "status")?.name ||
    properties.find(
      (property) =>
        property.type === "select" &&
        ["ステータス", "status", "Status", "状態"].includes(property.name),
    )?.name ||
    properties.find((property) => property.type === "select")?.name;

  return {
    ...mapping,
    status: preferredStatus,
  };
}

function statusOptionColor(
  properties: NotionProperty[],
  propertyName: string | undefined,
  optionName: string | undefined,
) {
  if (!propertyName || !optionName) {
    return undefined;
  }

  return properties
    .find((property) => property.name === propertyName)
    ?.options?.find((option) => option.name === optionName)?.color;
}

function isPageInsteadOfDatabaseError(error: unknown) {
  return (
    error instanceof NotionApiError &&
    error.status === 400 &&
    error.message.includes("is a page, not a database")
  );
}

async function findChildDatabases(
  token: string,
  blockId: string,
  depth = 0,
  maxDepth = 3,
): Promise<ChildDatabaseCandidate[]> {
  if (depth > maxDepth) {
    return [];
  }

  const candidates: ChildDatabaseCandidate[] = [];
  let cursor: string | undefined;

  do {
    const query = new URLSearchParams({ page_size: "100" });
    if (cursor) {
      query.set("start_cursor", cursor);
    }

    const response = await notionFetch<NotionBlockChildrenResponse>(
      token,
      `/blocks/${blockId}/children?${query.toString()}`,
    );

    for (const block of response.results) {
      if (block.type === "child_database") {
        candidates.push({
          id: block.id,
          title: block.child_database?.title || "Untitled database",
        });
      }

      if (block.has_children) {
        candidates.push(
          ...(await findChildDatabases(token, block.id, depth + 1, maxDepth)),
        );
      }
    }

    cursor = response.next_cursor ?? undefined;
    if (!response.has_more) {
      cursor = undefined;
    }
  } while (cursor);

  return candidates;
}

async function resolvePageToSingleChildDatabase(token: string, pageId: string) {
  const candidates = await findChildDatabases(token, pageId);

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length > 1) {
    const hints = candidates
      .slice(0, 5)
      .map((candidate) => `${candidate.title}: ${candidate.id}`)
      .join(" / ");

    throw new NotionApiError(
      400,
      `入力されたIDはページIDです。ページ内に複数のデータベースがあります。接続したいDB本体のIDを入力してください。候補: ${hints}`,
      "page_has_multiple_databases",
    );
  }

  throw new NotionApiError(
    400,
    "入力されたIDはページIDです。このページ内に接続できるデータベースが見つかりませんでした。NotionでDB本体を開いて、そのURL/IDを入力してください。",
    "page_has_no_database",
  );
}

export async function resolveDataSource(token: string, rawTargetId: string) {
  const targetId = extractNotionId(rawTargetId);
  const directDataSource = await tryNotionFetch<NotionDataSource>(
    token,
    `/data_sources/${targetId}`,
  );

  if (directDataSource) {
    return {
      databaseId: undefined,
      dataSourceId: directDataSource.id,
      name: directDataSource.name ?? plainTitle(directDataSource.title),
      properties: normalizeProperties(directDataSource.properties),
    };
  }

  let database: NotionDatabase;
  try {
    database = await notionFetch<NotionDatabase>(token, `/databases/${targetId}`);
  } catch (error) {
    if (!isPageInsteadOfDatabaseError(error)) {
      throw error;
    }

    const childDatabase = await resolvePageToSingleChildDatabase(token, targetId);
    database = await notionFetch<NotionDatabase>(
      token,
      `/databases/${childDatabase.id}`,
    );
  }

  const firstDataSource = database.data_sources?.[0];
  if (!firstDataSource) {
    throw new NotionApiError(
      400,
      "このデータベースには取得可能なData Sourceがありません。",
      "missing_data_source",
    );
  }

  const dataSource = await notionFetch<NotionDataSource>(
    token,
    `/data_sources/${firstDataSource.id}`,
  );

  return {
    databaseId: database.id,
    dataSourceId: dataSource.id,
    name: firstDataSource.name ?? dataSource.name ?? plainTitle(database.title),
    properties: normalizeProperties(dataSource.properties),
  };
}

function richTextToPlain(value: unknown) {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((part) => {
      if (part && typeof part === "object" && "plain_text" in part) {
        return String(part.plain_text ?? "");
      }
      return "";
    })
    .join("");
}

function getTitle(page: NotionPage, propertyName: string) {
  const property = page.properties[propertyName];
  return richTextToPlain(property?.title).trim() || "無題";
}

function getMemo(page: NotionPage, propertyName?: string) {
  if (!propertyName) {
    return "";
  }
  return richTextToPlain(page.properties[propertyName]?.rich_text);
}

function getDate(page: NotionPage, propertyName: string) {
  const dateValue = page.properties[propertyName]?.date as
    | { start?: string; end?: string | null }
    | undefined;

  if (!dateValue?.start) {
    return null;
  }

  return {
    start: dateValue.start,
    end: dateValue.end ?? undefined,
    isAllDay: !dateValue.start.includes("T"),
  };
}

function getStatus(page: NotionPage, propertyName?: string) {
  if (!propertyName) {
    return {};
  }

  const property = page.properties[propertyName];
  const value =
    (property?.select as NotionOption | null | undefined) ??
    (property?.status as NotionOption | null | undefined);

  return { status: value?.name, statusColor: value?.color };
}

function getTags(page: NotionPage, propertyName?: string) {
  if (!propertyName) {
    return [];
  }

  const value = page.properties[propertyName]?.multi_select;
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((tag) => {
      if (tag && typeof tag === "object" && "name" in tag) {
        return String(tag.name);
      }
      return "";
    })
    .filter(Boolean);
}

export function pageToTask(
  page: NotionPage,
  mapping: PropertyMapping,
  properties: NotionProperty[] = [],
): PlannerTask | null {
  const date = getDate(page, mapping.date);
  if (!date) {
    return null;
  }

  const status = getStatus(page, mapping.status);
  const statusColor =
    status.statusColor ??
    statusOptionColor(properties, mapping.status, status.status);

  return {
    id: page.id,
    title: getTitle(page, mapping.title),
    start: date.start,
    end: date.end,
    isAllDay: date.isAllDay,
    memo: getMemo(page, mapping.memo),
    tags: getTags(page, mapping.tags),
    url: page.url,
    status: status.status,
    statusColor,
  };
}

export async function queryTasks(
  token: string,
  rawTargetId: string,
  mapping: PropertyMapping,
  from: string,
  to: string,
) {
  const { dataSourceId, properties } = await resolveDataSource(token, rawTargetId);
  const completedMapping = completeMapping(mapping, properties);
  const results: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const response = await notionFetch<NotionQueryResponse>(
      token,
      `/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        body: JSON.stringify({
          page_size: 100,
          start_cursor: cursor,
          filter: {
            and: [
              { property: completedMapping.date, date: { on_or_after: from } },
              { property: completedMapping.date, date: { before: to } },
            ],
          },
          sorts: [{ property: completedMapping.date, direction: "ascending" }],
        }),
      },
    );

    results.push(...response.results);
    cursor = response.next_cursor ?? undefined;
    if (!response.has_more) {
      cursor = undefined;
    }
  } while (cursor);

  return results
    .map((page) => pageToTask(page, completedMapping, properties))
    .filter((task): task is PlannerTask => task !== null);
}

function datePayload(task: TaskInput) {
  return {
    date: {
      start: task.start,
      end: task.end || null,
    },
  };
}

function buildProperties(
  task: TaskInput,
  mapping: PropertyMapping,
  propertyTypes: Partial<Record<keyof PropertyMapping, NotionPropertyType>>,
) {
  const properties: Record<string, unknown> = {
    [mapping.title]: {
      title: [{ text: { content: task.title } }],
    },
    [mapping.date]: datePayload(task),
  };

  if (mapping.status && task.status) {
    properties[mapping.status] =
      propertyTypes.status === "status"
        ? { status: { name: task.status } }
        : { select: { name: task.status } };
  }

  if (mapping.memo) {
    properties[mapping.memo] = {
      rich_text: task.memo ? [{ text: { content: task.memo } }] : [],
    };
  }

  if (mapping.tags) {
    properties[mapping.tags] = {
      multi_select: (task.tags ?? []).map((name) => ({ name })),
    };
  }

  return properties;
}

export async function createTask(
  token: string,
  rawTargetId: string,
  mapping: PropertyMapping,
  propertyTypes: Partial<Record<keyof PropertyMapping, NotionPropertyType>>,
  task: TaskInput,
) {
  const { dataSourceId, properties } = await resolveDataSource(token, rawTargetId);
  const completedMapping = completeMapping(mapping, properties);

  const page = await notionFetch<NotionPage>(token, "/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { data_source_id: dataSourceId },
      properties: buildProperties(task, completedMapping, propertyTypes),
    }),
  });

  return pageToTask(page, completedMapping, properties);
}

export async function updateTask(
  token: string,
  pageId: string,
  mapping: PropertyMapping,
  propertyTypes: Partial<Record<keyof PropertyMapping, NotionPropertyType>>,
  task: TaskInput,
) {
  const page = await notionFetch<NotionPage>(token, `/pages/${extractNotionId(pageId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      properties: buildProperties(task, mapping, propertyTypes),
    }),
  });

  return pageToTask(page, mapping);
}

export function errorResponse(error: unknown) {
  if (error instanceof NotionApiError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  return Response.json(
    { error: error instanceof Error ? error.message : "Unknown error" },
    { status: 500 },
  );
}

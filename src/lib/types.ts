export type NotionPropertyType =
  | "title"
  | "date"
  | "select"
  | "status"
  | "rich_text"
  | "multi_select"
  | "checkbox"
  | "number"
  | "url"
  | "email"
  | "phone_number"
  | "people"
  | "relation"
  | string;

export type NotionOption = {
  id?: string;
  name: string;
  color?: string;
};

export type NotionProperty = {
  id: string;
  name: string;
  type: NotionPropertyType;
  options?: NotionOption[];
};

export type PropertyMapping = {
  title: string;
  date: string;
  status?: string;
  memo?: string;
  tags?: string;
};

export type AppConfig = {
  targetId: string;
  targetName?: string;
  databaseId?: string;
  dataSourceId?: string;
  properties: NotionProperty[];
  mapping: PropertyMapping;
};

export type PlannerTask = {
  id: string;
  title: string;
  start: string;
  end?: string;
  isAllDay: boolean;
  status?: string;
  statusColor?: string;
  memo?: string;
  tags: string[];
  url?: string;
};

export type StatusFilterOption = {
  name: string;
  color?: string;
  count: number;
};

export type TaskInput = {
  title: string;
  start: string;
  end?: string;
  status?: string;
  memo?: string;
  tags?: string[];
};

export type SchemaResponse = {
  databaseId?: string;
  dataSourceId: string;
  name: string;
  properties: NotionProperty[];
};

export type TaskMutationPayload = {
  targetId: string;
  mapping: PropertyMapping;
  propertyTypes: Partial<Record<keyof PropertyMapping, NotionPropertyType>>;
  task: TaskInput;
};

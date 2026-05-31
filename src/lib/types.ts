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

export type NotionIcon =
  | {
      type: "emoji";
      value: string;
    }
  | {
      type: "external" | "file";
      value: string;
    };

export type PlannerTask = {
  id: string;
  title: string;
  start: string;
  end?: string;
  isAllDay: boolean;
  source?: "notion" | "google";
  notionDataSourceId?: string;
  notionDatabaseName?: string;
  googleCalendarId?: string;
  googleCalendarName?: string;
  colorHex?: string;
  status?: string;
  statusColor?: string;
  memo?: string;
  tags: string[];
  url?: string;
  icon?: NotionIcon;
};

export type GoogleCalendarOption = {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
};

export type GoogleUserProfile = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
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

export type NotionDatabaseOption = {
  databaseId?: string;
  dataSourceId: string;
  name: string;
};

export type UserSettings = {
  notionConfigs: AppConfig[];
  activeNotionDataSourceId?: string | null;
  selectedNotionDataSourceIds: string[];
  hiddenStatuses: string[];
  showAllDayTasks: boolean;
  themeMode: "light" | "dark";
  interactionMode: "view" | "change";
  selectedGoogleCalendarIds: string[];
  googleCalendarColors: Record<string, string>;
  updatedAt?: string;
};

export type TaskMutationPayload = {
  targetId: string;
  mapping: PropertyMapping;
  propertyTypes: Partial<Record<keyof PropertyMapping, NotionPropertyType>>;
  task: TaskInput;
};

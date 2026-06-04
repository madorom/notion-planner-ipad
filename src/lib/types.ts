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
  | "files"
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
  url?: string | string[];
  files?: string | string[];
  relation?: string | string[];
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
  externalUrl?: string;
  externalUrls?: PlannerLink[];
  attachments?: PlannerAttachment[];
  relations?: PlannerRelationGroup[];
  propertySummaries?: PlannerPropertySummary[];
  icon?: NotionIcon;
};

export type PlannerLink = {
  name: string;
  url: string;
};

export type PlannerAttachment = {
  name: string;
  url: string;
  type?: "external" | "file";
};

export type PlannerRelationGroup = {
  name: string;
  pageIds: string[];
};

export type PlannerPropertySummary = {
  name: string;
  type: NotionPropertyType;
  value: string;
  supported: boolean;
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
  externalUrl?: string;
  externalUrls?: PlannerLink[];
  attachments?: PlannerAttachment[];
  relations?: PlannerRelationGroup[];
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

export type AllDayRowId = "default" | "split";
export type AllDayRowHeights = Partial<Record<AllDayRowId, number>>;

export type UserSettings = {
  notionConfigs: AppConfig[];
  activeNotionDataSourceId?: string | null;
  selectedNotionDataSourceIds: string[];
  splitAllDayNotionDataSourceIds: string[];
  hiddenAllDayRowIds: AllDayRowId[];
  allDayRowHeights: AllDayRowHeights;
  hiddenStatuses: string[];
  showAllDayTasks: boolean;
  weekVisibleDays: number;
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

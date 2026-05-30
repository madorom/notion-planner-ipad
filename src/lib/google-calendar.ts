import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "crypto";
import type { PlannerTask } from "@/lib/types";
import { getAuthSecret } from "@/lib/auth";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const GOOGLE_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const GOOGLE_STATE_MAX_AGE_SECONDS = 60 * 10;

export const GOOGLE_TOKEN_COOKIE_NAME = "google_calendar_refresh";
export const GOOGLE_STATE_COOKIE_NAME = "google_calendar_oauth_state";

type GoogleOAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  colorId?: string;
  status?: string;
  start?: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
};

type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEvent[];
  error?: {
    message?: string;
  };
};

function parseCookie(header: string | null, name: string) {
  if (!header) {
    return null;
  }

  const cookies = header.split(";").map((part) => part.trim());
  for (const cookie of cookies) {
    const [key, ...valueParts] = cookie.split("=");
    if (key === name) {
      try {
        return decodeURIComponent(valueParts.join("="));
      } catch {
        return null;
      }
    }
  }

  return null;
}

function encryptionKey() {
  const secret = getAuthSecret();
  if (!secret) {
    return null;
  }

  return createHash("sha256").update(secret).digest();
}

function encodeBase64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export function googleCookieOptions(maxAge = GOOGLE_TOKEN_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function expiredGoogleCookieOptions() {
  return {
    ...googleCookieOptions(0),
    maxAge: 0,
  };
}

export function googleOAuthStateCookieOptions() {
  return googleCookieOptions(GOOGLE_STATE_MAX_AGE_SECONDS);
}

export function googleCalendarConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function missingGoogleConfigMessage() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return "GOOGLE_CLIENT_IDとGOOGLE_CLIENT_SECRETをVercelのEnvironment Variablesに設定してください。";
  }

  if (!getAuthSecret()) {
    return "AUTH_SECRETが未設定です。VercelのEnvironment Variablesに設定してください。";
  }

  return null;
}

export function googleRedirectUri(request: Request) {
  return (
    process.env.GOOGLE_REDIRECT_URI ??
    `${new URL(request.url).origin}/api/google/callback`
  );
}

export function createGoogleOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function isValidGoogleOAuthState(expected: string | null, actual: string | null) {
  return Boolean(expected && actual && safeEqual(expected, actual));
}

export function encryptedRefreshToken(refreshToken: string) {
  const key = encryptionKey();
  if (!key) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(refreshToken, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    encodeBase64Url(iv),
    encodeBase64Url(tag),
    encodeBase64Url(encrypted),
  ].join(".");
}

export function decryptedRefreshToken(value: string | null) {
  if (!value) {
    return null;
  }

  const key = encryptionKey();
  if (!key) {
    return null;
  }

  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      decodeBase64Url(ivText),
    );
    decipher.setAuthTag(decodeBase64Url(tagText));
    return Buffer.concat([
      decipher.update(decodeBase64Url(encryptedText)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

export function readGoogleRefreshToken(request: Request) {
  return decryptedRefreshToken(
    parseCookie(request.headers.get("cookie"), GOOGLE_TOKEN_COOKIE_NAME),
  );
}

export function readGoogleOAuthState(request: Request) {
  return parseCookie(request.headers.get("cookie"), GOOGLE_STATE_COOKIE_NAME);
}

export function buildGoogleAuthorizationUrl(request: Request, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPE,
    state,
    access_type: "offline",
    prompt: "consent",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function parseGoogleResponse<T>(response: Response) {
  const body = (await response.json().catch(() => null)) as T | null;

  if (!response.ok) {
    const errorBody = body as
      | GoogleOAuthTokenResponse
      | GoogleCalendarEventsResponse
      | null;
    const oauthError =
      (errorBody as GoogleOAuthTokenResponse | null)?.error_description ??
      (errorBody as GoogleOAuthTokenResponse | null)?.error;
    const calendarError = (errorBody as GoogleCalendarEventsResponse | null)
      ?.error?.message;
    const message =
      typeof oauthError === "string" ? oauthError : calendarError;

    throw new Error(message ?? `Google API request failed: ${response.status}`);
  }

  return body as T;
}

export async function exchangeGoogleCodeForTokens(
  request: Request,
  code: string,
) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(request),
      grant_type: "authorization_code",
    }),
  });

  return parseGoogleResponse<GoogleOAuthTokenResponse>(response);
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const token = await parseGoogleResponse<GoogleOAuthTokenResponse>(response);
  if (!token.access_token) {
    throw new Error("Google Calendarのアクセストークンを取得できませんでした。");
  }

  return token.access_token;
}

function googleColorIdToStatusColor(colorId?: string) {
  switch (colorId) {
    case "2":
      return "green";
    case "3":
      return "purple";
    case "4":
      return "red";
    case "5":
      return "yellow";
    case "6":
      return "orange";
    case "7":
      return "blue";
    case "8":
      return "gray";
    case "9":
      return "blue";
    case "10":
      return "green";
    case "11":
      return "red";
    default:
      return "blue";
  }
}

function googleEventToTask(event: GoogleCalendarEvent): PlannerTask | null {
  if (event.status === "cancelled" || !event.id) {
    return null;
  }

  const start = event.start?.dateTime ?? event.start?.date;
  if (!start) {
    return null;
  }

  const end = event.end?.dateTime ?? event.end?.date ?? undefined;

  return {
    id: `google:${event.id}`,
    title: event.summary?.trim() || "Google Calendar",
    start,
    end,
    isAllDay: Boolean(event.start?.date),
    source: "google",
    statusColor: googleColorIdToStatusColor(event.colorId),
    memo: event.description ?? "",
    tags: [],
    url: event.htmlLink,
  };
}

export async function queryGoogleCalendarTasks(
  accessToken: string,
  from: string,
  to: string,
  calendarId = "primary",
) {
  const params = new URLSearchParams({
    timeMin: from,
    timeMax: to,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  });
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
      calendarId,
    )}/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );
  const data = await parseGoogleResponse<GoogleCalendarEventsResponse>(response);

  return (data.items ?? [])
    .map(googleEventToTask)
    .filter((task): task is PlannerTask => task !== null);
}

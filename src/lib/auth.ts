import { createHmac, timingSafeEqual } from "crypto";

export const AUTH_COOKIE_NAME = "notion_planner_session";
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function authSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV !== "production") {
    return "dev-only-notion-planner-secret";
  }

  return null;
}

function sign(value: string) {
  const secret = authSecret();
  if (!secret) {
    return null;
  }

  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

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

export function missingAuthConfigMessage() {
  if (!process.env.APP_PASSWORD) {
    return "APP_PASSWORDが未設定です。VercelのEnvironment Variablesに設定してください。";
  }

  if (!authSecret()) {
    return "AUTH_SECRETが未設定です。VercelのEnvironment Variablesに設定してください。";
  }

  return null;
}

export function verifyPassword(password: string) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || !password) {
    return false;
  }

  return safeEqual(password, expected);
}

export function createSessionValue() {
  const issuedAt = String(Date.now());
  const signature = sign(issuedAt);
  if (!signature) {
    return null;
  }

  return `${issuedAt}.${signature}`;
}

export function isValidSessionValue(value: string | null) {
  if (!value) {
    return false;
  }

  const [issuedAt, signature] = value.split(".");
  if (!issuedAt || !signature) {
    return false;
  }

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    return false;
  }

  const maxAgeMs = AUTH_MAX_AGE_SECONDS * 1000;
  if (Date.now() - issuedAtMs > maxAgeMs) {
    return false;
  }

  const expectedSignature = sign(issuedAt);
  return Boolean(expectedSignature && safeEqual(signature, expectedSignature));
}

export function isAuthenticatedRequest(request: Request) {
  if (!process.env.APP_PASSWORD) {
    return false;
  }

  const cookie = parseCookie(request.headers.get("cookie"), AUTH_COOKIE_NAME);
  return isValidSessionValue(cookie);
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    maxAge: AUTH_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function expiredAuthCookieOptions() {
  return {
    ...authCookieOptions(),
    maxAge: 0,
  };
}

export function authErrorResponse() {
  return Response.json({ error: "ログインが必要です。" }, { status: 401 });
}

export function getServerNotionToken() {
  return process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY ?? null;
}

import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  authCookieOptions,
  createSessionValue,
  missingAuthConfigMessage,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  const missingConfig = missingAuthConfigMessage();
  if (missingConfig) {
    return Response.json({ error: missingConfig }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
  };

  if (!verifyPassword(body.password ?? "")) {
    return Response.json({ error: "パスワードが違います。" }, { status: 401 });
  }

  const session = createSessionValue();
  if (!session) {
    return Response.json(
      { error: "AUTH_SECRETが未設定です。" },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(AUTH_COOKIE_NAME, session, authCookieOptions());
  return response;
}

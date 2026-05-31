import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, isAuthenticatedRequest } from "@/lib/auth";
import {
  GOOGLE_TOKEN_COOKIE_NAME,
  GOOGLE_USER_COOKIE_NAME,
  expiredGoogleCookieOptions,
} from "@/lib/google-calendar";

export async function POST(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return authErrorResponse();
  }

  const response = NextResponse.json({ connected: false });
  response.cookies.set(
    GOOGLE_TOKEN_COOKIE_NAME,
    "",
    expiredGoogleCookieOptions(),
  );
  response.cookies.set(
    GOOGLE_USER_COOKIE_NAME,
    "",
    expiredGoogleCookieOptions(),
  );

  return response;
}

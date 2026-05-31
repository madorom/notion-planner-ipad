import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, isAuthenticatedRequest } from "@/lib/auth";
import {
  GOOGLE_STATE_COOKIE_NAME,
  GOOGLE_TOKEN_COOKIE_NAME,
  GOOGLE_USER_COOKIE_NAME,
  encryptedGoogleUserProfile,
  encryptedRefreshToken,
  exchangeGoogleCodeForTokens,
  expiredGoogleCookieOptions,
  fetchGoogleUserProfile,
  googleCookieOptions,
  isValidGoogleOAuthState,
  missingGoogleConfigMessage,
  readGoogleOAuthState,
} from "@/lib/google-calendar";

function redirectHome(request: NextRequest, status: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("google", status);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return authErrorResponse();
  }

  const missingConfig = missingGoogleConfigMessage();
  if (missingConfig) {
    return Response.json({ error: missingConfig }, { status: 503 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = readGoogleOAuthState(request);

  if (!isValidGoogleOAuthState(expectedState, state)) {
    const response = redirectHome(request, "invalid_state");
    response.cookies.set(
      GOOGLE_STATE_COOKIE_NAME,
      "",
      expiredGoogleCookieOptions(),
    );
    return response;
  }

  if (!code) {
    const response = redirectHome(request, "missing_code");
    response.cookies.set(
      GOOGLE_STATE_COOKIE_NAME,
      "",
      expiredGoogleCookieOptions(),
    );
    return response;
  }

  try {
    const token = await exchangeGoogleCodeForTokens(request, code);
    if (!token.refresh_token) {
      const response = redirectHome(request, "missing_refresh_token");
      response.cookies.set(
        GOOGLE_STATE_COOKIE_NAME,
        "",
        expiredGoogleCookieOptions(),
      );
      return response;
    }

    const encryptedToken = encryptedRefreshToken(token.refresh_token);
    if (!encryptedToken) {
      return Response.json(
        { error: "Google Calendar連携用トークンを保存できませんでした。" },
        { status: 503 },
      );
    }

    const response = redirectHome(request, "connected");
    response.cookies.set(
      GOOGLE_TOKEN_COOKIE_NAME,
      encryptedToken,
      googleCookieOptions(),
    );
    if (token.access_token) {
      const profile = await fetchGoogleUserProfile(token.access_token);
      const encryptedProfile = encryptedGoogleUserProfile(profile);

      if (encryptedProfile) {
        response.cookies.set(
          GOOGLE_USER_COOKIE_NAME,
          encryptedProfile,
          googleCookieOptions(),
        );
      }
    }
    response.cookies.set(
      GOOGLE_STATE_COOKIE_NAME,
      "",
      expiredGoogleCookieOptions(),
    );
    return response;
  } catch {
    const response = redirectHome(request, "error");
    response.cookies.set(
      GOOGLE_STATE_COOKIE_NAME,
      "",
      expiredGoogleCookieOptions(),
    );
    return response;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, isAuthenticatedRequest } from "@/lib/auth";
import {
  GOOGLE_STATE_COOKIE_NAME,
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  googleOAuthStateCookieOptions,
  missingGoogleConfigMessage,
} from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return authErrorResponse();
  }

  const missingConfig = missingGoogleConfigMessage();
  if (missingConfig) {
    return Response.json({ error: missingConfig }, { status: 503 });
  }

  const state = createGoogleOAuthState();
  const response = NextResponse.redirect(
    buildGoogleAuthorizationUrl(request, state),
  );
  response.cookies.set(
    GOOGLE_STATE_COOKIE_NAME,
    state,
    googleOAuthStateCookieOptions(),
  );

  return response;
}

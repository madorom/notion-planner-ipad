import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, isAuthenticatedRequest } from "@/lib/auth";
import {
  GOOGLE_USER_COOKIE_NAME,
  googleCalendarConfigured,
  googleCookieOptions,
  readGoogleRefreshToken,
  resolveGoogleUserProfile,
} from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return authErrorResponse();
  }

  const connected = Boolean(readGoogleRefreshToken(request));
  const user = connected
    ? await resolveGoogleUserProfile(request).catch(() => ({
        profile: null,
        encryptedProfile: null,
      }))
    : { profile: null, encryptedProfile: null };
  const response = NextResponse.json({
    configured: googleCalendarConfigured(),
    connected,
    user: user.profile,
  });

  if (user.encryptedProfile) {
    response.cookies.set(
      GOOGLE_USER_COOKIE_NAME,
      user.encryptedProfile,
      googleCookieOptions(),
    );
  }

  return response;
}

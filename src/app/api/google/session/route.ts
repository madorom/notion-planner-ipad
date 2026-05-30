import { NextRequest } from "next/server";
import { authErrorResponse, isAuthenticatedRequest } from "@/lib/auth";
import {
  googleCalendarConfigured,
  readGoogleRefreshToken,
} from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return authErrorResponse();
  }

  return Response.json({
    configured: googleCalendarConfigured(),
    connected: Boolean(readGoogleRefreshToken(request)),
  });
}

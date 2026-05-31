import { NextRequest } from "next/server";
import { authErrorResponse, isAuthenticatedRequest } from "@/lib/auth";
import {
  missingGoogleConfigMessage,
  queryGoogleCalendarList,
  readGoogleRefreshToken,
  refreshGoogleAccessToken,
} from "@/lib/google-calendar";

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticatedRequest(request)) {
      return authErrorResponse();
    }

    const missingConfig = missingGoogleConfigMessage();
    if (missingConfig) {
      return Response.json({ error: missingConfig }, { status: 503 });
    }

    const refreshToken = readGoogleRefreshToken(request);
    if (!refreshToken) {
      return Response.json({ calendars: [], connected: false });
    }

    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const calendars = await queryGoogleCalendarList(accessToken);

    return Response.json({ calendars, connected: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Googleカレンダー一覧を取得できませんでした。",
      },
      { status: 500 },
    );
  }
}

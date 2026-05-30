import { NextRequest } from "next/server";
import { authErrorResponse, isAuthenticatedRequest } from "@/lib/auth";
import {
  missingGoogleConfigMessage,
  queryGoogleCalendarTasks,
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
      return Response.json({ tasks: [], connected: false });
    }

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const calendarId = request.nextUrl.searchParams.get("calendarId") ?? "primary";

    if (!from || !to) {
      return Response.json(
        { error: "Google Calendar予定取得に必要な期間が不足しています。" },
        { status: 400 },
      );
    }

    const accessToken = await refreshGoogleAccessToken(refreshToken);
    const tasks = await queryGoogleCalendarTasks(
      accessToken,
      from,
      to,
      calendarId,
    );

    return Response.json({ tasks, connected: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google Calendar予定を取得できませんでした。",
      },
      { status: 500 },
    );
  }
}

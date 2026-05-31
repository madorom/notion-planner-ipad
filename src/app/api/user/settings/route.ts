import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, isAuthenticatedRequest } from "@/lib/auth";
import {
  GOOGLE_USER_COOKIE_NAME,
  googleCookieOptions,
  resolveGoogleUserProfile,
} from "@/lib/google-calendar";
import {
  readUserSettings,
  sanitizeUserSettings,
  userSettingsStorageConfigured,
  writeUserSettings,
} from "@/lib/user-settings";

async function resolveUserResponse(request: NextRequest) {
  const user = await resolveGoogleUserProfile(request).catch(() => ({
    profile: null,
    encryptedProfile: null,
  }));

  if (!user.profile) {
    return {
      user,
      response: NextResponse.json(
        {
          configured: userSettingsStorageConfigured(),
          connected: false,
          error: "Google連携が必要です。",
        },
        { status: 401 },
      ),
    };
  }

  return { user, response: null };
}

function setUserCookie(
  response: NextResponse,
  encryptedProfile: string | null,
) {
  if (!encryptedProfile) {
    return;
  }

  response.cookies.set(
    GOOGLE_USER_COOKIE_NAME,
    encryptedProfile,
    googleCookieOptions(),
  );
}

export async function GET(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return authErrorResponse();
  }

  const configured = userSettingsStorageConfigured();
  const { user, response } = await resolveUserResponse(request);
  if (response) {
    return response;
  }

  if (!configured) {
    const fallbackResponse = NextResponse.json({
      configured: false,
      connected: true,
      user: user.profile,
      settings: null,
    });
    setUserCookie(fallbackResponse, user.encryptedProfile);
    return fallbackResponse;
  }

  try {
    const settings = await readUserSettings(user.profile!);
    const settingsResponse = NextResponse.json({
      configured: true,
      connected: true,
      user: user.profile,
      settings,
    });
    setUserCookie(settingsResponse, user.encryptedProfile);
    return settingsResponse;
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        connected: true,
        user: user.profile,
        error:
          error instanceof Error
            ? error.message
            : "ユーザー設定を取得できませんでした。",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!isAuthenticatedRequest(request)) {
    return authErrorResponse();
  }

  const configured = userSettingsStorageConfigured();
  const { user, response } = await resolveUserResponse(request);
  if (response) {
    return response;
  }

  if (!configured) {
    const fallbackResponse = NextResponse.json({
      configured: false,
      connected: true,
      user: user.profile,
      saved: false,
    });
    setUserCookie(fallbackResponse, user.encryptedProfile);
    return fallbackResponse;
  }

  try {
    const body = (await request.json()) as { settings?: unknown };
    const settings = sanitizeUserSettings(body.settings);

    if (!settings) {
      return NextResponse.json(
        { error: "保存する設定の形式が不正です。" },
        { status: 400 },
      );
    }

    const savedSettings = await writeUserSettings(user.profile!, settings);
    const settingsResponse = NextResponse.json({
      configured: true,
      connected: true,
      user: user.profile,
      saved: true,
      settings: savedSettings,
    });
    setUserCookie(settingsResponse, user.encryptedProfile);
    return settingsResponse;
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        connected: true,
        user: user.profile,
        error:
          error instanceof Error
            ? error.message
            : "ユーザー設定を保存できませんでした。",
      },
      { status: 500 },
    );
  }
}

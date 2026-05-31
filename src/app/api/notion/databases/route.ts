import { NextRequest } from "next/server";
import {
  authErrorResponse,
  getServerNotionToken,
  isAuthenticatedRequest,
} from "@/lib/auth";
import { errorResponse, listDatabases } from "@/lib/notion";

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticatedRequest(request)) {
      return authErrorResponse();
    }

    const token = getServerNotionToken();

    if (!token) {
      return Response.json(
        {
          error:
            "NOTION_TOKENが未設定です。VercelのEnvironment Variablesに設定してください。",
        },
        { status: 503 },
      );
    }

    const databases = await listDatabases(token);
    return Response.json({ databases });
  } catch (error) {
    return errorResponse(error);
  }
}

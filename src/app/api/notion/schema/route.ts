import { NextRequest } from "next/server";
import {
  authErrorResponse,
  getServerNotionToken,
  isAuthenticatedRequest,
} from "@/lib/auth";
import { errorResponse, resolveDataSource } from "@/lib/notion";

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticatedRequest(request)) {
      return authErrorResponse();
    }

    const token = getServerNotionToken();
    const targetId = request.nextUrl.searchParams.get("targetId");

    if (!token) {
      return Response.json(
        {
          error:
            "NOTION_TOKENが未設定です。VercelのEnvironment Variablesに設定してください。",
        },
        { status: 503 },
      );
    }

    if (!targetId) {
      return Response.json(
        { error: "データベースIDまたはData Source IDを入力してください。" },
        { status: 400 },
      );
    }

    return Response.json(await resolveDataSource(token, targetId));
  } catch (error) {
    return errorResponse(error);
  }
}

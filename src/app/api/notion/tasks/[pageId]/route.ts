import { NextRequest } from "next/server";
import {
  authErrorResponse,
  getServerNotionToken,
  isAuthenticatedRequest,
} from "@/lib/auth";
import { errorResponse, updateTask } from "@/lib/notion";
import type { TaskMutationPayload } from "@/lib/types";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ pageId: string }> },
) {
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

    const { pageId } = await context.params;
    const payload = (await request.json()) as TaskMutationPayload;
    const task = await updateTask(
      token,
      pageId,
      payload.mapping,
      payload.propertyTypes,
      payload.task,
    );

    return Response.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}

import { NextRequest } from "next/server";
import {
  authErrorResponse,
  getServerNotionToken,
  isAuthenticatedRequest,
} from "@/lib/auth";
import { errorResponse, updateTask, updateTaskTrash } from "@/lib/notion";
import type { TaskMutationPayload } from "@/lib/types";

type TaskTrashPayload = {
  inTrash?: boolean;
};

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

export async function PUT(
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
    const payload = (await request.json()) as TaskTrashPayload;
    await updateTaskTrash(token, pageId, Boolean(payload.inTrash));

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
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
    await updateTaskTrash(token, pageId, true);

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

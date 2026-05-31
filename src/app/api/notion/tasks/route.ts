import { NextRequest } from "next/server";
import {
  authErrorResponse,
  getServerNotionToken,
  isAuthenticatedRequest,
} from "@/lib/auth";
import {
  createTask,
  errorResponse,
  queryTasks,
} from "@/lib/notion";
import type { PropertyMapping, TaskMutationPayload } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    if (!isAuthenticatedRequest(request)) {
      return authErrorResponse();
    }

    const token = getServerNotionToken();
    const targetId = request.nextUrl.searchParams.get("targetId");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");
    const mapping: PropertyMapping = {
      title: request.nextUrl.searchParams.get("titleProperty") ?? "",
      date: request.nextUrl.searchParams.get("dateProperty") ?? "",
      status: request.nextUrl.searchParams.get("statusProperty") ?? undefined,
      memo: request.nextUrl.searchParams.get("memoProperty") ?? undefined,
      tags: request.nextUrl.searchParams.get("tagsProperty") ?? undefined,
      url: request.nextUrl.searchParams.get("urlProperty") ?? undefined,
      files: request.nextUrl.searchParams.get("filesProperty") ?? undefined,
    };

    if (!token) {
      return Response.json(
        {
          error:
            "NOTION_TOKENが未設定です。VercelのEnvironment Variablesに設定してください。",
        },
        { status: 503 },
      );
    }

    if (!targetId || !from || !to || !mapping.title || !mapping.date) {
      return Response.json(
        { error: "タスク取得に必要な設定が不足しています。" },
        { status: 400 },
      );
    }

    const tasks = await queryTasks(token, targetId, mapping, from, to);
    return Response.json({ tasks });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
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

    const payload = (await request.json()) as TaskMutationPayload;
    const task = await createTask(
      token,
      payload.targetId,
      payload.mapping,
      payload.propertyTypes,
      payload.task,
    );

    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

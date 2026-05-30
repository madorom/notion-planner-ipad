import { NextRequest } from "next/server";
import { isAuthenticatedRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  return Response.json({
    authenticated: isAuthenticatedRequest(request),
  });
}

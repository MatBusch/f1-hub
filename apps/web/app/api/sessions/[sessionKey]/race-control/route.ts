import { getTinybirdRepository, jsonRoute, parseOptionalIntParam, withCache } from "@/lib/server/tinybird";
import { type NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ sessionKey: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return jsonRoute(async () => {
    const { sessionKey } = await context.params;
    const parsedSessionKey = Number.parseInt(sessionKey, 10);

    if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
      throw new Error('Invalid "sessionKey" route parameter.');
    }

    const limit = parseOptionalIntParam(request.nextUrl.searchParams.get("limit"), "limit", 1);

    return getTinybirdRepository().getRaceControlFeed({
      sessionKey: parsedSessionKey,
      limit,
    });
  }, withCache(15, 60));
}

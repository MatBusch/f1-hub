import {
  getTinybirdRepository,
  jsonRoute,
  parseOptionalIntParam,
  withCache,
} from "@/lib/server/tinybird";
import { authenticatedJsonRoute } from "@/lib/server/auth-session";
import { type NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ sessionKey: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return authenticatedJsonRoute(
    request,
    async () => {
      const { sessionKey } = await context.params;
      const parsedSessionKey = Number.parseInt(sessionKey, 10);

      if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
        throw new Error('Invalid "sessionKey" route parameter.');
      }

      const fromChunk = parseOptionalIntParam(
        request.nextUrl.searchParams.get("fromChunk"),
        "fromChunk",
      );

      if (fromChunk === undefined) {
        throw new Error('Missing required "fromChunk" query parameter.');
      }

      const toChunk = parseOptionalIntParam(
        request.nextUrl.searchParams.get("toChunk"),
        "toChunk",
      );

      return getTinybirdRepository().getReplayChunks({
        sessionKey: parsedSessionKey,
        fromChunk,
        toChunk,
      });
    },
    jsonRoute,
    withCache(300, 3600),
  );
}

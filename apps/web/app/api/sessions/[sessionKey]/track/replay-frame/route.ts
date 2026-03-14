import {
  getTinybirdRepository,
  jsonRoute,
  parseOptionalIntParam,
} from "@/lib/server/tinybird";
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

    const atTime = request.nextUrl.searchParams.get("atTime");

    if (!atTime) {
      throw new Error('Missing required "atTime" query parameter.');
    }

    const windowMs = parseOptionalIntParam(
      request.nextUrl.searchParams.get("windowMs"),
      "windowMs",
      1,
    );

    return getTinybirdRepository().getTrackReplayFrame({
      sessionKey: parsedSessionKey,
      atTime,
      windowMs,
    });
  });
}

import {
  getTinybirdRepository,
  jsonRoute,
  parseOptionalIntParam,
  withCache,
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

    const driverNumber = parseOptionalIntParam(
      request.nextUrl.searchParams.get("driverNumber"),
      "driverNumber",
      1,
    );
    const limit = parseOptionalIntParam(
      request.nextUrl.searchParams.get("limit"),
      "limit",
      1,
    );
    const fromTime = request.nextUrl.searchParams.get("fromTime") ?? undefined;
    const toTime = request.nextUrl.searchParams.get("toTime") ?? undefined;

    return getTinybirdRepository().getTrackPositionFrames({
      sessionKey: parsedSessionKey,
      driverNumber,
      fromTime,
      toTime,
      limit,
    });
  }, withCache(300, 3600));
}

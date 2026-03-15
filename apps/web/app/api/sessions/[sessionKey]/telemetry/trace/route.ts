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

      const driverNumber = parseOptionalIntParam(
        request.nextUrl.searchParams.get("driverNumber"),
        "driverNumber",
        1,
      );
      const lapNumber = parseOptionalIntParam(
        request.nextUrl.searchParams.get("lapNumber"),
        "lapNumber",
        1,
      );

      if (!driverNumber) {
        throw new Error('Missing required "driverNumber" query parameter.');
      }

      if (!lapNumber) {
        throw new Error('Missing required "lapNumber" query parameter.');
      }

      return getTinybirdRepository().getTelemetryTrace({
        sessionKey: parsedSessionKey,
        driverNumber,
        lapNumber,
      });
    },
    jsonRoute,
    withCache(300, 3600),
  );
}

import {
  getTinybirdRepository,
  jsonRoute,
  parseOptionalIntParam,
  withCache,
} from "@/lib/server/tinybird";
import { normalizedTopicSchema } from "@f1-hub/contracts";
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

    const fromSequence = parseOptionalIntParam(
      request.nextUrl.searchParams.get("fromSequence"),
      "fromSequence",
    );
    const limit = parseOptionalIntParam(
      request.nextUrl.searchParams.get("limit"),
      "limit",
      1,
    );
    const rawTopic = request.nextUrl.searchParams.get("topic");
    const topic = rawTopic ? normalizedTopicSchema.parse(rawTopic) : undefined;

    return getTinybirdRepository().getLiveWindow({
      sessionKey: parsedSessionKey,
      fromSequence,
      limit,
      topic,
    });
  }, withCache(15, 60));
}

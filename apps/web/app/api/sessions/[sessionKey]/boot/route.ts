import { getTinybirdRepository, jsonRoute, withCache } from "@/lib/server/tinybird";

type RouteContext = {
  params: Promise<{ sessionKey: string }>;
};

export async function GET(_: Request, context: RouteContext) {
  return jsonRoute(async () => {
    const { sessionKey } = await context.params;
    const parsedSessionKey = Number.parseInt(sessionKey, 10);

    if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
      throw new Error('Invalid "sessionKey" route parameter.');
    }

    const boot = await getTinybirdRepository().getSessionBoot(parsedSessionKey);
    return boot ?? null;
  }, withCache(300, 3600));
}

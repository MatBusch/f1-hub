import {
  getTinybirdRepository,
  jsonRoute,
  withCache,
} from "@/lib/server/tinybird";
import { authenticatedJsonRoute } from "@/lib/server/auth-session";

type RouteContext = {
  params: Promise<{ sessionKey: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return authenticatedJsonRoute(
    request,
    async () => {
      const { sessionKey } = await context.params;
      const parsedSessionKey = Number.parseInt(sessionKey, 10);

      if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
        throw new Error('Invalid "sessionKey" route parameter.');
      }

      const catalog = await getTinybirdRepository().getSessionCatalog({
        limit: 500,
      });
      const row = catalog.data.find(
        (entry) => entry.sessionKey === parsedSessionKey,
      );

      if (!row) {
        throw new Error("404 session metadata not found");
      }

      return row;
    },
    jsonRoute,
    withCache(60),
  );
}

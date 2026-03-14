import {
  getTinybirdRepository,
  jsonRoute,
  parseOptionalIntParam,
} from "@/lib/server/tinybird";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return jsonRoute(async () => {
    const season = parseOptionalIntParam(
      request.nextUrl.searchParams.get("season"),
      "season",
    );
    const limit = parseOptionalIntParam(
      request.nextUrl.searchParams.get("limit"),
      "limit",
      1,
    );
    const status = request.nextUrl.searchParams.get("status") ?? undefined;
    return getTinybirdRepository().getSessionCatalog({ season, status, limit });
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/lib/server/db/schema";
import { getAuthDatabaseUrl } from "@/lib/server/db/config";

declare global {
  var __f1HubAuthPool: Pool | undefined;
}

const connectionString = getAuthDatabaseUrl();

const pool =
  globalThis.__f1HubAuthPool ??
  new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 10 : 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__f1HubAuthPool = pool;
}

export const authDb = drizzle(pool, { schema });
export { schema };

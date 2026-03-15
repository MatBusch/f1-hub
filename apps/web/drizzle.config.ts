import { defineConfig } from "drizzle-kit";
import { getAuthDatabaseUrl } from "./lib/server/db/config";

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/server/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getAuthDatabaseUrl(),
  },
});

const AUTH_DATABASE_URL_KEYS = [
  "AUTH_DATABASE_URL",
  "DATABASE_URL",
  "POSTGRES_URL",
] as const;

export function getAuthDatabaseUrl() {
  for (const key of AUTH_DATABASE_URL_KEYS) {
    const value = process.env[key];

    if (value) {
      return value;
    }
  }

  throw new Error(
    `Missing auth database URL. Set one of: ${AUTH_DATABASE_URL_KEYS.join(", ")}`,
  );
}

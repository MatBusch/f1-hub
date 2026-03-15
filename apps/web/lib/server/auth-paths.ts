const DEFAULT_CALLBACK_PATH = "/dashboard";

export function normalizeCallbackPath(
  value: string | null | undefined,
  fallback = DEFAULT_CALLBACK_PATH,
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  return value;
}

export function getAppBaseUrl() {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3001";
}

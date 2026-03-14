import { createTinybirdRepository } from "@f1-hub/data";

let repository: ReturnType<typeof createTinybirdRepository> | null = null;

function requiredEnv(name: "TINYBIRD_TOKEN" | "TINYBIRD_URL") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getTinybirdRepository() {
  if (!repository) {
    repository = createTinybirdRepository({
      baseUrl: requiredEnv("TINYBIRD_URL"),
      token: requiredEnv("TINYBIRD_TOKEN"),
    });
  }

  return repository;
}

export function parseOptionalIntParam(
  value: string | null,
  name: string,
  min = 0,
) {
  if (value === null || value.length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(`Invalid "${name}" query parameter.`);
  }

  return parsed;
}

function inferErrorStatus(error: unknown) {
  if (!(error instanceof Error)) {
    return 500;
  }

  const match = error.message.match(/\b(\d{3})\b/);

  if (!match) {
    return 500;
  }

  const status = Number.parseInt(match[1]!, 10);
  return Number.isFinite(status) ? status : 500;
}

export async function jsonRoute<T>(
  handler: () => Promise<T>,
  init?: ResponseInit,
) {
  try {
    const data = await handler();
    return Response.json({ ok: true, data }, init);
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: inferErrorStatus(error) },
    );
  }
}

export function withCache(seconds: number, staleWhileRevalidate = seconds * 5) {
  return {
    headers: {
      "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${staleWhileRevalidate}`,
    },
  } satisfies ResponseInit;
}

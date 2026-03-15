import { headers } from "next/headers";

import { auth } from "@/lib/auth";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

function mergeResponseInit(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);

  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) {
    headers.set(key, value);
  }

  return {
    ...init,
    headers,
  };
}

export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function getRequestSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
  });
}

export function unauthorizedJson(message = "Unauthorized") {
  return Response.json(
    { ok: false, error: message },
    {
      status: 401,
      headers: PRIVATE_HEADERS,
    },
  );
}

export async function authenticatedJsonRoute<T>(
  request: Request,
  handler: () => Promise<T>,
  jsonRoute: (
    handler: () => Promise<T>,
    init?: ResponseInit,
  ) => Promise<Response>,
  init?: ResponseInit,
) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorizedJson();
  }

  return jsonRoute(handler, mergeResponseInit(init));
}

import { getTinybirdRepository } from "@/lib/server/tinybird";
import { getRequestSession, unauthorizedJson } from "@/lib/server/auth-session";
import { type NextRequest } from "next/server";

type RouteContext = {
  params: Promise<{ sessionKey: string }>;
};

const encoder = new TextEncoder();

function writeEvent(name: string, payload: unknown) {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const session = await getRequestSession(request);

  if (!session) {
    return unauthorizedJson();
  }

  const { sessionKey } = await context.params;
  const parsedSessionKey = Number.parseInt(sessionKey, 10);

  if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
    return new Response("Invalid sessionKey", { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let active = true;
      let fromSequence = 0;

      request.signal.addEventListener("abort", () => {
        active = false;
        controller.close();
      });

      controller.enqueue(writeEvent("ready", { sessionKey: parsedSessionKey }));

      while (active) {
        try {
          const [summary, boot, liveWindow, raceControl, latestTrackPositions] =
            await Promise.all([
              getTinybirdRepository().getSessionSummary(parsedSessionKey),
              getTinybirdRepository().getSessionBoot(parsedSessionKey),
              getTinybirdRepository().getLiveWindow({
                sessionKey: parsedSessionKey,
                fromSequence,
                limit: 40,
              }),
              getTinybirdRepository().getRaceControlFeed({
                sessionKey: parsedSessionKey,
                limit: 12,
              }),
              getTinybirdRepository().getTrackLatestPositions(parsedSessionKey),
            ]);

          const latestSequence =
            liveWindow.data[liveWindow.data.length - 1]?.sequence ??
            fromSequence;

          controller.enqueue(
            writeEvent("snapshot", {
              summary,
              boot,
              liveWindow: liveWindow.data,
              raceControl: raceControl.data,
              latestTrackPositions: latestTrackPositions.data,
            }),
          );

          fromSequence = latestSequence + 1;
        } catch (error) {
          controller.enqueue(
            writeEvent("error", {
              message:
                error instanceof Error ? error.message : "Stream poll failed",
            }),
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "private, no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}

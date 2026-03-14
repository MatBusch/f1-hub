import { SessionReplay } from "@/components/clone-fastlytics/SessionReplay";

type CloneReplayRouteProps = {
  params: Promise<{ sessionKey: string }>;
};

export default async function CloneReplayRoute({ params }: CloneReplayRouteProps) {
  const { sessionKey } = await params;
  const parsedSessionKey = Number.parseInt(sessionKey, 10);

  if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
    throw new Error('Invalid "sessionKey" route parameter.');
  }

  return <SessionReplay sessionKey={parsedSessionKey} />;
}

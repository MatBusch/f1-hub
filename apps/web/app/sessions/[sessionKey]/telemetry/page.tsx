import { TelemetryWorkspace } from "@/components/telemetry-workspace";

type TelemetryPageProps = {
  params: Promise<{ sessionKey: string }>;
};

export default async function TelemetryPage({ params }: TelemetryPageProps) {
  const { sessionKey } = await params;
  const parsedSessionKey = Number.parseInt(sessionKey, 10);

  if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
    throw new Error('Invalid "sessionKey" route parameter.');
  }

  return <TelemetryWorkspace sessionKey={parsedSessionKey} />;
}

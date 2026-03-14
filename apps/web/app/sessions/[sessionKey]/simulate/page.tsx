import { F1DashReplay } from "@/components/f1dash-replay";

type SimulationPageProps = {
  params: Promise<{ sessionKey: string }>;
};

export default async function SimulationPage({ params }: SimulationPageProps) {
  const { sessionKey } = await params;
  const parsedSessionKey = Number.parseInt(sessionKey, 10);

  if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
    throw new Error('Invalid "sessionKey" route parameter.');
  }

  return <F1DashReplay sessionKey={parsedSessionKey} />;
}

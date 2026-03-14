import { SessionDetail } from "@/components/session-detail";

type SessionPageProps = {
  params: Promise<{ sessionKey: string }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { sessionKey } = await params;
  const parsedSessionKey = Number.parseInt(sessionKey, 10);

  if (!Number.isFinite(parsedSessionKey) || parsedSessionKey < 0) {
    throw new Error('Invalid "sessionKey" route parameter.');
  }

  return <SessionDetail sessionKey={parsedSessionKey} />;
}

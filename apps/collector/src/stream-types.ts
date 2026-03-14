import { z } from "zod";

export const streamMessageTypeSchema = z.enum([
  "session_boot",
  "topic_update",
]);

export const streamEnvelopeSchema = z.object({
  streamVersion: z.literal("1"),
  messageType: streamMessageTypeSchema,
  messageId: z.string().min(1),
  collectorRunId: z.string().min(1),
  producerInstanceId: z.string().min(1),
  season: z.number().int().min(2018),
  meetingKey: z.number().int().nonnegative(),
  meetingName: z.string().min(1),
  sessionKey: z.number().int().nonnegative(),
  sessionType: z.string().min(1),
  sessionName: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  sequence: z.number().int().nonnegative().nullable(),
  upstreamTopic: z.string().min(1).nullable(),
  normalizedTopic: z.string().min(1).nullable(),
  emittedAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  publishedAt: z.string().datetime(),
  payloadJson: z.string().min(2),
});

export type StreamEnvelope = z.infer<typeof streamEnvelopeSchema>;

export type SessionBootPayload = {
  status: string;
  driverCount: number;
  bootSequence: number;
  initialState: Record<string, unknown>;
  drivers: Array<{
    sessionKey: number;
    meetingKey: number;
    driverNumber: number;
    broadcastName: string;
    fullName: string;
    nameAcronym: string;
    teamName: string;
    teamColor: string;
    headshotUrl?: string;
  }>;
};

export type TopicUpdatePayload = {
  topic: string;
  timestamp: string;
  data: unknown;
};

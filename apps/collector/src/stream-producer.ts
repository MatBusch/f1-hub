import { type CollectorConfig } from "./config.js";
import { type RedisConnection } from "./redis.js";
import { type StreamEnvelope } from "./stream-types.js";

function toFields(message: StreamEnvelope) {
  return [
    "streamVersion",
    message.streamVersion,
    "messageType",
    message.messageType,
    "messageId",
    message.messageId,
    "collectorRunId",
    message.collectorRunId,
    "producerInstanceId",
    message.producerInstanceId,
    "season",
    String(message.season),
    "meetingKey",
    String(message.meetingKey),
    "meetingName",
    message.meetingName,
    "sessionKey",
    String(message.sessionKey),
    "sessionType",
    message.sessionType,
    "sessionName",
    message.sessionName,
    "startsAt",
    message.startsAt,
    "endsAt",
    message.endsAt,
    "sequence",
    message.sequence === null ? "" : String(message.sequence),
    "upstreamTopic",
    message.upstreamTopic ?? "",
    "normalizedTopic",
    message.normalizedTopic ?? "",
    "emittedAt",
    message.emittedAt,
    "receivedAt",
    message.receivedAt,
    "publishedAt",
    message.publishedAt,
    "payloadJson",
    message.payloadJson,
  ];
}

export async function publishStreamMessage(
  client: RedisConnection,
  config: CollectorConfig,
  message: StreamEnvelope,
) {
  await client.sendCommand([
    "XADD",
    config.streamKey,
    "MAXLEN",
    "~",
    String(config.streamMaxLen),
    "*",
    ...toFields(message),
  ]);
}

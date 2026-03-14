import { createClient } from "redis";

import { type CollectorConfig } from "./config.js";

export type RedisConnection = ReturnType<typeof createClient>;

export function createRedisConnection(url: string) {
  return createClient({ url });
}

export async function connectRedis(url: string) {
  const client = createRedisConnection(url);
  client.on("error", (error) => {
    console.error("[redis] client error", error);
  });
  await client.connect();
  return client;
}

export async function ensureStreamGroup(
  client: RedisConnection,
  config: CollectorConfig,
) {
  try {
    await client.sendCommand([
      "XGROUP",
      "CREATE",
      config.streamKey,
      config.streamGroup,
      "0",
      "MKSTREAM",
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("BUSYGROUP")) {
      throw error;
    }
  }
}

export function getDlqKey(streamKey: string) {
  return `${streamKey}:dlq`;
}

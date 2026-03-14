import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({ path: ".env.local", override: false });

const collectorConfigSchema = z.object({
  tinybirdToken: z.string().min(1),
  tinybirdUrl: z.string().url(),
  flushIntervalMs: z.coerce.number().int().positive().default(250),
  dryRun: z.coerce.number().int().default(1).transform((value) => value === 1),
  redisUrl: z.string().url(),
  streamKey: z.string().min(1).default("f1hub:collector:events"),
  streamGroup: z.string().min(1).default("tinybird-writers"),
  streamBatchSize: z.coerce.number().int().positive().default(100),
  streamBlockMs: z.coerce.number().int().nonnegative().default(250),
  streamMaxLen: z.coerce.number().int().positive().default(50000),
  dedupeTtlSeconds: z.coerce.number().int().positive().default(86400),
  pendingIdleMs: z.coerce.number().int().positive().default(15000),
  dlqMaxDeliveries: z.coerce.number().int().positive().default(5),
  maxOutlineSourceFrames: z.coerce.number().int().positive().default(2000),
  metricsEnabled: z.coerce.number().int().default(1).transform((value) => value === 1),
  metricsHost: z.string().min(1).default("0.0.0.0"),
  ingestMetricsPort: z.coerce.number().int().positive().default(9464),
  writerMetricsPort: z.coerce.number().int().positive().default(9465),
});

export type CollectorConfig = z.infer<typeof collectorConfigSchema>;

export function getCollectorConfig(): CollectorConfig {
  return collectorConfigSchema.parse({
    tinybirdToken: process.env.TINYBIRD_TOKEN,
    tinybirdUrl: process.env.TINYBIRD_URL,
    flushIntervalMs: process.env.COLLECTOR_FLUSH_INTERVAL_MS,
    dryRun: process.env.COLLECTOR_DRY_RUN,
    redisUrl: process.env.REDIS_URL,
    streamKey: process.env.COLLECTOR_STREAM_KEY,
    streamGroup: process.env.COLLECTOR_STREAM_GROUP,
    streamBatchSize: process.env.COLLECTOR_STREAM_BATCH_SIZE,
    streamBlockMs: process.env.COLLECTOR_STREAM_BLOCK_MS,
    streamMaxLen: process.env.COLLECTOR_STREAM_MAXLEN,
    dedupeTtlSeconds: process.env.COLLECTOR_DEDUPE_TTL_SEC,
    pendingIdleMs: process.env.COLLECTOR_PENDING_IDLE_MS,
    dlqMaxDeliveries: process.env.COLLECTOR_DLQ_MAX_DELIVERIES,
    maxOutlineSourceFrames: process.env.COLLECTOR_MAX_OUTLINE_SOURCE_FRAMES,
    metricsEnabled: process.env.COLLECTOR_METRICS_ENABLED,
    metricsHost: process.env.COLLECTOR_METRICS_HOST,
    ingestMetricsPort: process.env.COLLECTOR_INGEST_METRICS_PORT,
    writerMetricsPort: process.env.COLLECTOR_WRITER_METRICS_PORT,
  });
}

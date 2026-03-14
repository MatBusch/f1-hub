import { createServer } from "node:http";

import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

import { type CollectorConfig } from "./config.js";

type MetricsServer = {
  registry: Registry;
};

async function startMetricsServer(
  registry: Registry,
  host: string,
  port: number,
  role: string,
) {
  const server = createServer(async (_request, response) => {
    response.statusCode = 200;
    response.setHeader("Content-Type", registry.contentType);
    response.end(await registry.metrics());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`[collector:${role}] metrics listening on http://${host}:${port}/metrics`);
}

async function createMetricsServer(
  config: CollectorConfig,
  role: string,
  port: number,
): Promise<MetricsServer> {
  const registry = new Registry();
  collectDefaultMetrics({
    register: registry,
    prefix: `f1hub_collector_${role}_`,
  });

  if (config.metricsEnabled) {
    await startMetricsServer(registry, config.metricsHost, port, role);
  }

  return { registry };
}

export async function createIngestMetrics(config: CollectorConfig) {
  const { registry } = await createMetricsServer(
    config,
    "ingest",
    config.ingestMetricsPort,
  );

  return {
    signalrConnected: new Gauge({
      name: "f1hub_collector_ingest_signalr_connected",
      help: "Whether the ingest websocket is currently connected",
      registers: [registry],
    }),
    signalrConnectionsTotal: new Counter({
      name: "f1hub_collector_ingest_signalr_connections_total",
      help: "Total SignalR connections established by ingest",
      registers: [registry],
    }),
    signalrReconnectsTotal: new Counter({
      name: "f1hub_collector_ingest_signalr_reconnects_total",
      help: "Total ingest reconnect loops triggered after runtime errors",
      registers: [registry],
    }),
    redisPublishesTotal: new Counter({
      name: "f1hub_collector_ingest_redis_publishes_total",
      help: "Total stream messages published to Redis",
      labelNames: ["message_type", "upstream_topic"],
      registers: [registry],
    }),
    redisPublishFailuresTotal: new Counter({
      name: "f1hub_collector_ingest_redis_publish_failures_total",
      help: "Total Redis publish failures",
      labelNames: ["message_type"],
      registers: [registry],
    }),
    redisPublishDurationSeconds: new Histogram({
      name: "f1hub_collector_ingest_redis_publish_duration_seconds",
      help: "Latency of Redis XADD publishes",
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      labelNames: ["message_type"],
      registers: [registry],
    }),
    currentSessionKey: new Gauge({
      name: "f1hub_collector_ingest_current_session_key",
      help: "Current session key being ingested",
      registers: [registry],
    }),
  };
}

export async function createWriterMetrics(config: CollectorConfig) {
  const { registry } = await createMetricsServer(
    config,
    "writer",
    config.writerMetricsPort,
  );

  return {
    streamBatchesTotal: new Counter({
      name: "f1hub_collector_writer_stream_batches_total",
      help: "Total Redis batches processed by the writer",
      registers: [registry],
    }),
    streamBatchSize: new Histogram({
      name: "f1hub_collector_writer_stream_batch_size",
      help: "Size of Redis batches processed by the writer",
      buckets: [1, 5, 10, 25, 50, 100, 250, 500],
      registers: [registry],
    }),
    streamMessagesProcessedTotal: new Counter({
      name: "f1hub_collector_writer_stream_messages_processed_total",
      help: "Total stream messages successfully processed",
      labelNames: ["message_type"],
      registers: [registry],
    }),
    streamFailuresTotal: new Counter({
      name: "f1hub_collector_writer_stream_failures_total",
      help: "Total stream message processing failures",
      labelNames: ["message_type"],
      registers: [registry],
    }),
    streamDlqTotal: new Counter({
      name: "f1hub_collector_writer_stream_dlq_total",
      help: "Total messages moved to the dead-letter stream",
      registers: [registry],
    }),
    reclaimedMessagesTotal: new Counter({
      name: "f1hub_collector_writer_reclaimed_messages_total",
      help: "Total stale pending messages reclaimed with XAUTOCLAIM",
      registers: [registry],
    }),
    activeSessions: new Gauge({
      name: "f1hub_collector_writer_active_sessions",
      help: "Number of session states currently held by the writer",
      registers: [registry],
    }),
    endToEndLagSeconds: new Histogram({
      name: "f1hub_collector_writer_end_to_end_lag_seconds",
      help: "Lag from event emission to successful processing",
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120],
      labelNames: ["message_type"],
      registers: [registry],
    }),
    tinybirdAppendDurationSeconds: new Histogram({
      name: "f1hub_collector_writer_tinybird_append_duration_seconds",
      help: "Latency of Tinybird append calls",
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      labelNames: ["datasource"],
      registers: [registry],
    }),
    tinybirdRowsTotal: new Counter({
      name: "f1hub_collector_writer_tinybird_rows_total",
      help: "Rows appended to Tinybird by datasource",
      labelNames: ["datasource"],
      registers: [registry],
    }),
  };
}

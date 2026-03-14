import { createTinybirdRepository } from "@f1-hub/data";
import { type LiveEnvelope } from "@f1-hub/contracts";

import { getCollectorConfig } from "./config.js";
import { TinybirdEventsClient } from "./tinybird-events.js";

function parseIntArg(name: string, fallback?: number) {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));

  if (!arg) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`Missing required "--${name}" argument.`);
  }

  const value = Number.parseInt(arg.slice(name.length + 3), 10);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid "--${name}" argument.`);
  }

  return value;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

async function readAllEnvelopes(
  sessionKey: number,
  pageSize: number,
  repository: ReturnType<typeof createTinybirdRepository>,
) {
  const envelopes: LiveEnvelope[] = [];
  let fromSequence = 0;

  for (;;) {
    const page = await repository.getLiveWindow({
      sessionKey,
      fromSequence,
      limit: pageSize,
    });

    if (page.data.length === 0) {
      return envelopes;
    }

    envelopes.push(...page.data);

    if (page.data.length < pageSize) {
      return envelopes;
    }

    fromSequence = page.data[page.data.length - 1]!.sequence + 1;
  }
}

function buildChunks(sessionKey: number, chunkSize: number, events: LiveEnvelope[]) {
  const chunks: Array<{
    sessionKey: number;
    chunkIndex: number;
    rangeStartSequence: number;
    rangeEndSequence: number;
    emittedAt: string;
    eventsJson: string;
  }> = [];

  for (let index = 0; index < events.length; index += chunkSize) {
    const slice = events.slice(index, index + chunkSize);
    const first = slice[0];
    const last = slice[slice.length - 1];

    if (!first || !last) {
      continue;
    }

    chunks.push({
      sessionKey,
      chunkIndex: chunks.length,
      rangeStartSequence: first.sequence,
      rangeEndSequence: last.sequence,
      emittedAt: last.emittedAt,
      eventsJson: JSON.stringify(slice),
    });
  }

  return chunks;
}

const sessionKey = parseIntArg("session-key");
const chunkSize = parseIntArg("chunk-size", 25);
const pageSize = parseIntArg("page-size", 500);
const force = hasFlag("force");

const config = getCollectorConfig();
const repository = createTinybirdRepository({
  baseUrl: config.tinybirdUrl,
  token: config.tinybirdToken,
});
const tinybird = new TinybirdEventsClient(
  config.tinybirdUrl,
  config.tinybirdToken,
  fetch,
  config.dryRun,
);

const summary = await repository.getSessionSummary(sessionKey);
const existingReplay = await repository.getReplayChunks({
  sessionKey,
  fromChunk: 0,
});

if (existingReplay.data.length > 0 && !force) {
  throw new Error(
    `Replay chunks already exist for session ${sessionKey}. Re-run with --force only if you have cleaned the datasource first.`,
  );
}

const envelopes = await readAllEnvelopes(sessionKey, pageSize, repository);

if (envelopes.length === 0) {
  throw new Error(`No live envelopes found for session ${sessionKey}.`);
}

const chunks = buildChunks(sessionKey, chunkSize, envelopes);

console.log(`[backfill-replay] session ${sessionKey}`);
console.log(`[backfill-replay] status ${summary.status}`);
console.log(`[backfill-replay] dry run ${config.dryRun ? "on" : "off"}`);
console.log(`[backfill-replay] envelopes ${envelopes.length}`);
console.log(`[backfill-replay] chunk size ${chunkSize}`);
console.log(`[backfill-replay] chunks ${chunks.length}`);

const batchSize = 50;

for (let index = 0; index < chunks.length; index += batchSize) {
  const batch = chunks.slice(index, index + batchSize);
  const result = await tinybird.appendReplayChunks(batch);
  console.log("[backfill-replay] append", result);
}

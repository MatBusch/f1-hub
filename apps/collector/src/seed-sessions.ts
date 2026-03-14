import { getCollectorConfig } from "./config.js";
import { deriveMeetingName, deriveSessionStatus, OpenF1Client } from "./openf1.js";
import { TinybirdEventsClient } from "./tinybird-events.js";

function parseYearArg() {
  const yearArg = process.argv.find((arg) => arg.startsWith("--year="));

  if (!yearArg) {
    return new Date().getUTCFullYear();
  }

  const value = Number.parseInt(yearArg.slice("--year=".length), 10);

  if (!Number.isFinite(value) || value < 2018) {
    throw new Error('Invalid "--year" argument.');
  }

  return value;
}

const config = getCollectorConfig();
const year = parseYearArg();
const openF1 = new OpenF1Client();
const tinybird = new TinybirdEventsClient(
  config.tinybirdUrl,
  config.tinybirdToken,
  fetch,
  config.dryRun,
);

console.log(`[seed-sessions] year ${year}`);
console.log(`[seed-sessions] dry run ${config.dryRun ? "on" : "off"}`);

const sessions = await openF1.getSessions(year);
const driverCounts = new Map<number, number>();

for (const meetingKey of [...new Set(sessions.map((session) => session.meeting_key))]) {
  const driverCount = await openF1.getMeetingDriverCount(meetingKey);
  driverCounts.set(meetingKey, driverCount);
}

const updatedAt = new Date().toISOString();

const sessionRows = sessions.map((session) => ({
  season: session.year,
  meetingKey: session.meeting_key,
  meetingName: deriveMeetingName(session),
  sessionKey: session.session_key,
  sessionType: session.session_type,
  sessionName: session.session_name,
  startsAt: session.date_start,
  status: deriveSessionStatus(session.date_start, session.date_end),
  updatedAt,
}));

const summaryRows = sessions.map((session) => ({
  ...sessionRows.find((row) => row.sessionKey === session.session_key)!,
  driverCount: driverCounts.get(session.meeting_key) ?? 0,
  lastSequence: 0,
}));

const sessionResult = await tinybird.appendSessions(sessionRows);
const summaryResult = await tinybird.appendSessionSummaries(summaryRows);

console.log("[seed-sessions] sessions append", sessionResult);
console.log("[seed-sessions] summaries append", summaryResult);

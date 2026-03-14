import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OpenF1Client, type OpenF1Session } from "./openf1.js";

function parseYearArg() {
  const yearArg = process.argv.find((arg) => arg.startsWith("--year="));

  if (!yearArg) {
    return 2026;
  }

  const value = Number.parseInt(yearArg.slice("--year=".length), 10);

  if (!Number.isFinite(value) || value < 2018) {
    throw new Error('Invalid "--year" argument.');
  }

  return value;
}

function getCollectorRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), "..");
}

function getWorkspaceRoot() {
  return path.resolve(getCollectorRoot(), "..", "..");
}

function scoreAustralianMeetingSession(session: OpenF1Session) {
  const tokens = [
    session.country_name,
    session.location,
    session.circuit_short_name,
    session.session_name,
  ]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());

  let score = 0;

  if (tokens.some((value) => value.includes("australia"))) {
    score += 10;
  }

  if (tokens.some((value) => value.includes("melbourne"))) {
    score += 6;
  }

  if (
    tokens.some(
      (value) => value.includes("albert park") || value.includes("grand prix"),
    )
  ) {
    score += 3;
  }

  return score;
}

function selectAustralianMeeting(sessions: OpenF1Session[]) {
  const byMeeting = new Map<number, OpenF1Session[]>();

  for (const session of sessions) {
    const existing = byMeeting.get(session.meeting_key);

    if (existing) {
      existing.push(session);
      continue;
    }

    byMeeting.set(session.meeting_key, [session]);
  }

  const rankedMeetings = [...byMeeting.entries()]
    .map(([meetingKey, meetingSessions]) => ({
      meetingKey,
      sessions: meetingSessions.sort((left, right) =>
        left.date_start.localeCompare(right.date_start),
      ),
      score: Math.max(...meetingSessions.map(scoreAustralianMeetingSession)),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const winner = rankedMeetings[0];

  if (!winner) {
    throw new Error("Could not find an Australian meeting in the requested year.");
  }

  return winner;
}

async function runCommand(args: string[], label: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: getCollectorRoot(),
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

const year = parseYearArg();
const openF1 = new OpenF1Client();

console.log(`[bootstrap-australia-local] workspace ${getWorkspaceRoot()}`);
console.log(`[bootstrap-australia-local] year ${year}`);
console.log(
  `[bootstrap-australia-local] tinybird ${process.env.TINYBIRD_URL ?? "missing TINYBIRD_URL"}`,
);

const sessions = await openF1.getSessions(year);
const australianMeeting = selectAustralianMeeting(sessions);

console.log(
  `[bootstrap-australia-local] meeting ${australianMeeting.meetingKey}`,
);
console.log(
  `[bootstrap-australia-local] sessions ${australianMeeting.sessions
    .map((session) => `${session.session_key}:${session.session_name}`)
    .join(", ")}`,
);

await runCommand(
  ["exec", "tsx", "src/seed-sessions.ts", `--year=${year}`],
  "seed:sessions",
);

for (const session of australianMeeting.sessions) {
  console.log(
    `[bootstrap-australia-local] backfill track for session ${session.session_key} (${session.session_name})`,
  );

  await runCommand(
    [
      "exec",
      "tsx",
      "src/backfill-track.ts",
      `--session-key=${session.session_key}`,
    ],
    `backfill:track:${session.session_key}`,
  );
}

console.log("[bootstrap-australia-local] complete");

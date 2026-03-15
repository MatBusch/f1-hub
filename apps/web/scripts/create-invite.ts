import { createInvite } from "@/lib/server/invitations";

function readFlag(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const email = process.argv[2];

  if (!email) {
    throw new Error(
      "Usage: pnpm --filter @f1-hub/web auth:invite user@example.com [--name=Alex] [--hours=72] [--note=VIP]",
    );
  }

  const name = readFlag("name");
  const note = readFlag("note");
  const hours = readFlag("hours");

  const result = await createInvite({
    email,
    name,
    note,
    expiresInHours: hours ? Number.parseInt(hours, 10) : undefined,
  });

  console.log(`Invite created for ${result.invite.email}`);
  console.log(`Invite URL: ${result.url}`);
  console.log(`Expires at: ${result.invite.expiresAt.toISOString()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

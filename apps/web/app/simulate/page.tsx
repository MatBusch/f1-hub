import { SessionModeBrowser } from "@/components/session-mode-browser";

export default function SimulatePage() {
  return (
    <SessionModeBrowser
      mode="simulate"
      title="Replay browser"
      description="Browse completed sessions and jump straight into the historical replay workspace from a dedicated top-level route."
    />
  );
}

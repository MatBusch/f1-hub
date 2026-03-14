import { SessionModeBrowser } from "@/components/session-mode-browser";

export default function TelemetryPage() {
  return (
    <SessionModeBrowser
      mode="telemetry"
      title="Telemetry lab browser"
      description="Browse stored sessions and jump into dedicated telemetry deep-dive pages without mixing that workload into the live dashboard."
    />
  );
}

type CircuitMapSpec = {
  key: string;
  label: string;
  location: string;
  viewBox: { width: number; height: number };
  path: string;
  startFinish: { x1: number; y1: number; x2: number; y2: number };
};

const genericCircuit: CircuitMapSpec = {
  key: "generic",
  label: "Grand Prix Circuit",
  location: "Track map",
  viewBox: { width: 900, height: 520 },
  path: "M110,266 C138,121 270,61 407,61 C596,61 743,153 776,280 C806,393 712,453 539,458 C351,463 156,414 110,266 Z",
  startFinish: { x1: 115, y1: 240, x2: 115, y2: 295 },
};

const melbourneCircuit: CircuitMapSpec = {
  key: "melbourne",
  label: "Albert Park Circuit",
  location: "Melbourne",
  viewBox: { width: 900, height: 520 },
  path: "M138,313 C143,186 202,111 300,82 C373,60 470,70 548,88 C643,110 721,161 746,246 C770,328 734,393 648,430 C561,468 415,474 287,449 C188,429 129,386 138,313 Z",
  startFinish: { x1: 149, y1: 278, x2: 149, y2: 336 },
};

function getString(input: unknown) {
  return typeof input === "string" ? input : undefined;
}

export function findCircuitMap(sessionInfo: Record<string, unknown> | null) {
  const meeting =
    typeof sessionInfo?.Meeting === "object" && sessionInfo.Meeting !== null
      ? (sessionInfo.Meeting as Record<string, unknown>)
      : null;
  const circuit =
    typeof meeting?.Circuit === "object" && meeting.Circuit !== null
      ? (meeting.Circuit as Record<string, unknown>)
      : null;

  const searchText = [
    getString(circuit?.ShortName),
    getString(meeting?.Name),
    getString(meeting?.Location),
    getString(meeting?.OfficialName),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    searchText.includes("melbourne") ||
    searchText.includes("australian grand prix") ||
    searchText.includes("australia grand prix") ||
    searchText.includes("albert park")
  ) {
    return melbourneCircuit;
  }

  return genericCircuit;
}

export type { CircuitMapSpec };

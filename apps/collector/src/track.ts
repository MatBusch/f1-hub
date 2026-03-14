import {
  type TrackOutlinePoint,
  type TrackPositionFrame,
} from "@f1-hub/contracts";

function isValidTrackPoint(
  frame:
    | Pick<TrackPositionFrame, "x" | "y" | "z">
    | Pick<TrackOutlinePoint, "x" | "y" | "z">,
) {
  return !(frame.x === 0 && frame.y === 0 && (frame.z ?? 0) === 0);
}

function distanceSquared(
  left: Pick<TrackOutlinePoint, "x" | "y">,
  right: Pick<TrackOutlinePoint, "x" | "y">,
) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function extractSingleLapFrames(frames: TrackPositionFrame[]) {
  if (frames.length < 8) {
    return frames;
  }

  const orderedFrames = [...frames].sort((left, right) =>
    left.emittedAt.localeCompare(right.emittedAt),
  );
  const start = orderedFrames[0]!;
  const startX = start.x ?? 0;
  const startY = start.y ?? 0;
  const returnDistanceSquared = 420 * 420;
  const minSamplesBeforeClose = Math.min(
    Math.max(Math.floor(orderedFrames.length * 0.005), 40),
    300,
  );

  let traveledDistance = 0;
  let endIndex = orderedFrames.length - 1;

  for (let index = 1; index < orderedFrames.length; index += 1) {
    const previous = orderedFrames[index - 1]!;
    const current = orderedFrames[index]!;
    const previousX = previous.x ?? 0;
    const previousY = previous.y ?? 0;
    const currentX = current.x ?? 0;
    const currentY = current.y ?? 0;

    traveledDistance += Math.hypot(currentX - previousX, currentY - previousY);

    if (index < minSamplesBeforeClose) {
      continue;
    }

    const deltaX = currentX - startX;
    const deltaY = currentY - startY;
    const returnedNearStart =
      deltaX * deltaX + deltaY * deltaY <= returnDistanceSquared;

    if (returnedNearStart && traveledDistance > 6000) {
      endIndex = index;
      break;
    }
  }

  return orderedFrames.slice(0, endIndex + 1);
}

export function buildTrackOutline(
  frames: TrackPositionFrame[],
  maxPoints = 320,
): TrackOutlinePoint[] {
  const filtered = extractSingleLapFrames(
    frames.filter((frame) => isValidTrackPoint(frame)),
  );

  if (filtered.length === 0) {
    return [];
  }

  const first = filtered[0]!;
  const sessionKey = first.sessionKey;
  const meetingKey = first.meetingKey;
  const source = first.source;
  const minStepSquared = 95 * 95;
  const deduped: TrackOutlinePoint[] = [];
  let lastPoint: TrackOutlinePoint | null = null;

  for (const frame of filtered) {
    const candidate: TrackOutlinePoint = {
      sessionKey,
      meetingKey,
      pointIndex: 0,
      x: frame.x ?? 0,
      y: frame.y ?? 0,
      z: frame.z ?? null,
      source,
    };

    if (
      lastPoint &&
      candidate.x === lastPoint.x &&
      candidate.y === lastPoint.y &&
      (candidate.z ?? 0) === (lastPoint.z ?? 0)
    ) {
      continue;
    }

    if (!lastPoint || distanceSquared(candidate, lastPoint) >= minStepSquared) {
      deduped.push(candidate);
      lastPoint = candidate;
    }
  }

  if (deduped.length === 0) {
    return [];
  }

  const step = Math.max(Math.ceil(deduped.length / maxPoints), 1);
  const points = deduped
    .filter((_, index) => index % step === 0)
    .map((point, index) => ({
      ...point,
      pointIndex: index,
    }));

  const lastPointRaw = deduped[deduped.length - 1];

  if (
    lastPointRaw &&
    (points.length === 0 ||
      points[points.length - 1]!.x !== lastPointRaw.x ||
      points[points.length - 1]!.y !== lastPointRaw.y)
  ) {
    points.push({
      sessionKey,
      meetingKey,
      pointIndex: points.length,
      x: lastPointRaw.x,
      y: lastPointRaw.y,
      z: lastPointRaw.z ?? null,
      source,
    });
  }

  return points;
}

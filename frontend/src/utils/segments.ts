import type { Segment } from "../api/types";

export interface EditorSegment {
  key: string;
  id?: string;
  start_ms: number;
  end_ms: number;
}

export function fromApiSegments(segments: Segment[]): EditorSegment[] {
  return segments
    .map((segment) => ({
      key: segment.id ?? crypto.randomUUID(),
      id: segment.id,
      start_ms: segment.start_ms,
      end_ms: segment.end_ms,
    }))
    .sort((left, right) => left.start_ms - right.start_ms);
}

export function toPayload(segments: EditorSegment[]) {
  return segments
    .slice()
    .sort((left, right) => left.start_ms - right.start_ms)
    .map((segment) => ({
      id: segment.id,
      start_ms: Math.round(segment.start_ms),
      end_ms: Math.round(segment.end_ms),
    }));
}

export function totalDuration(segments: EditorSegment[]): number {
  return segments.reduce(
    (total, segment) => total + (segment.end_ms - segment.start_ms),
    0,
  );
}

export function overlapWith(
  segments: EditorSegment[],
  candidate: { start_ms: number; end_ms: number },
  excludeKey?: string,
): EditorSegment | null {
  return (
    segments.find(
      (segment) =>
        segment.key !== excludeKey &&
        candidate.start_ms < segment.end_ms &&
        segment.start_ms < candidate.end_ms,
    ) ?? null
  );
}

export function findFreeGap(
  segments: EditorSegment[],
  point: number,
  durationMs: number,
): [number, number] | null {
  const inside = segments.find(
    (segment) => point > segment.start_ms && point < segment.end_ms,
  );
  if (inside) return null;

  let gapStart = 0;
  let gapEnd = durationMs;
  for (const segment of segments) {
    if (segment.end_ms <= point) {
      gapStart = Math.max(gapStart, segment.end_ms);
    }
    if (segment.start_ms >= point) {
      gapEnd = Math.min(gapEnd, segment.start_ms);
    }
  }
  if (gapEnd <= gapStart) return null;
  return [gapStart, gapEnd];
}

export function findNeighbors(
  segments: EditorSegment[],
  key: string,
): { previousEnd: number; nextStart: number } {
  let previousEnd = 0;
  let nextStart = Number.POSITIVE_INFINITY;
  for (const segment of segments) {
    if (segment.key === key) continue;
    if (segment.end_ms <= segments.find((item) => item.key === key)!.start_ms) {
      previousEnd = Math.max(previousEnd, segment.end_ms);
    }
    if (
      segment.start_ms >= segments.find((item) => item.key === key)!.end_ms
    ) {
      nextStart = Math.min(nextStart, segment.start_ms);
    }
  }
  return {
    previousEnd,
    nextStart: Number.isFinite(nextStart) ? nextStart : Number.POSITIVE_INFINITY,
  };
}

export function minSegmentMs(fps: number | null): number {
  return fps && fps > 0 ? Math.max(1, Math.round(1000 / fps)) : 100;
}

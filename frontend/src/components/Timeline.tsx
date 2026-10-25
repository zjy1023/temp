import { Minus, Plus } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { formatDuration, snapMs } from "../utils/format";
import {
  findFreeGap,
  findNeighbors,
  minSegmentMs,
  type EditorSegment,
} from "../utils/segments";

interface TimelineProps {
  durationMs: number;
  currentMs: number;
  segments: EditorSegment[];
  selectedKey: string | null;
  readOnly: boolean;
  fps: number | null;
  onSeek: (ms: number) => void;
  onSelect: (key: string | null) => void;
  onChange: (next: EditorSegment[]) => void;
}

type DragMode = "create" | "move" | "resize-left" | "resize-right";

interface DragState {
  mode: DragMode;
  key?: string;
  pointerId: number;
  originMs: number;
  start: number;
  end: number;
  gapStart?: number;
  gapEnd?: number;
}

interface Preview {
  start: number;
  end: number;
  mode: DragMode;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function Timeline({
  durationMs,
  currentMs,
  segments,
  selectedKey,
  readOnly,
  fps,
  onSeek,
  onSelect,
  onChange,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const minimum = minSegmentMs(fps);

  function msFromEvent(event: ReactPointerEvent): number {
    const track = trackRef.current;
    if (!track || durationMs <= 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    return snapMs(ratio * durationMs, fps);
  }

  function handleTrackPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const ms = msFromEvent(event);
    onSeek(ms);
    if (readOnly) return;

    const gap = findFreeGap(segments, ms, durationMs);
    if (!gap) return;
    const start = clamp(ms, gap[0], gap[1] - minimum);
    if (gap[1] - gap[0] < minimum) return;

    onSelect(null);
    setDrag({
      mode: "create",
      pointerId: event.pointerId,
      originMs: ms,
      start,
      end: start,
      gapStart: gap[0],
      gapEnd: gap[1],
    });
    setPreview({ start, end: start, mode: "create" });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleSegmentPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
    segment: EditorSegment,
  ) {
    event.stopPropagation();
    onSelect(segment.key);
    if (readOnly || event.button !== 0) return;

    const handle = (event.target as HTMLElement).dataset.handle;
    const mode: DragMode =
      handle === "left"
        ? "resize-left"
        : handle === "right"
          ? "resize-right"
          : "move";
    const ms = msFromEvent(event);
    setDrag({
      mode,
      key: segment.key,
      pointerId: event.pointerId,
      originMs: ms,
      start: segment.start_ms,
      end: segment.end_ms,
    });
    setPreview({
      start: segment.start_ms,
      end: segment.end_ms,
      mode,
    });
    trackRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const ms = msFromEvent(event);

    if (drag.mode === "create") {
      const gapStart = drag.gapStart ?? 0;
      const gapEnd = drag.gapEnd ?? durationMs;
      const anchor = drag.start;
      if (Math.abs(ms - anchor) < minimum) {
        setPreview({ start: anchor, end: anchor, mode: "create" });
        return;
      }
      let start = clamp(Math.min(anchor, ms), gapStart, gapEnd);
      let end = clamp(Math.max(anchor, ms), gapStart, gapEnd);
      if (end - start < minimum) {
        if (ms >= anchor) {
          end = Math.min(anchor + minimum, gapEnd);
          start = Math.min(anchor, end - minimum);
        } else {
          start = Math.max(anchor - minimum, gapStart);
          end = Math.max(anchor, start + minimum);
        }
      }
      setPreview({ start, end, mode: "create" });
      return;
    }

    if (!drag.key) return;
    const segment = segments.find((item) => item.key === drag.key);
    if (!segment) return;
    const neighbors = findNeighbors(segments, drag.key);
    const nextStart =
      neighbors.nextStart === Number.POSITIVE_INFINITY
        ? durationMs
        : neighbors.nextStart;

    if (drag.mode === "move") {
      const length = drag.end - drag.start;
      const delta = ms - drag.originMs;
      const minStart = neighbors.previousEnd;
      const maxStart = Math.max(minStart, nextStart - length);
      const start = clamp(drag.start + delta, minStart, maxStart);
      setPreview({ start, end: start + length, mode: "move" });
      return;
    }

    if (drag.mode === "resize-left") {
      const start = clamp(ms, neighbors.previousEnd, drag.end - minimum);
      setPreview({ start, end: drag.end, mode: "resize-left" });
      return;
    }

    const end = clamp(ms, drag.start + minimum, nextStart);
    setPreview({ start: drag.start, end, mode: "resize-right" });
  }

  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag) return;
    event.currentTarget.releasePointerCapture?.(drag.pointerId);

    if (drag.mode === "create" && preview) {
      if (preview.end - preview.start >= minimum) {
        const created: EditorSegment = {
          key: crypto.randomUUID(),
          start_ms: Math.round(preview.start),
          end_ms: Math.round(preview.end),
        };
        onChange(
          [...segments, created].sort(
            (left, right) => left.start_ms - right.start_ms,
          ),
        );
        onSelect(created.key);
      }
    } else if (drag.key && preview) {
      onChange(
        segments
          .map((segment) =>
            segment.key === drag.key
              ? {
                  ...segment,
                  start_ms: Math.round(preview.start),
                  end_ms: Math.round(preview.end),
                }
              : segment,
          )
          .sort((left, right) => left.start_ms - right.start_ms),
      );
    }

    setDrag(null);
    setPreview(null);
  }

  const ticks = Array.from({ length: 9 }).map((_, index) => ({
    ratio: index / 8,
    label: formatDuration((durationMs * index) / 8),
  }));

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-900">时间轴</span>
          <span className="text-xs text-slate-500">
            拖拽空白创建片段，拖两端调整，拖中间移动
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(1, value - 1))}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="缩小时间轴"
          >
            <Minus size={14} />
          </button>
          <span className="w-10 text-center font-mono text-xs text-slate-500">
            {zoom}x
          </span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(6, value + 1))}
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
            aria-label="放大时间轴"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <div
          className="relative select-none"
          style={{ width: `${zoom * 100}%`, minWidth: "100%" }}
        >
          <div className="relative mb-1 h-6">
            {ticks.map((tick) => (
              <div
                key={tick.ratio}
                className="absolute top-0 -translate-x-1/2 text-[10px] font-mono text-slate-400"
                style={{ left: `${tick.ratio * 100}%` }}
              >
                {tick.label}
              </div>
            ))}
          </div>

          <div
            ref={trackRef}
            data-testid="timeline-track"
            className="relative h-20 touch-none rounded-lg border border-slate-200 bg-slate-100"
            onPointerDown={handleTrackPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <div className="pointer-events-none absolute inset-0 flex justify-between px-0">
              {ticks.map((tick) => (
                <div
                  key={tick.ratio}
                  className="h-full w-px bg-slate-200/80"
                  style={{ marginLeft: tick.ratio === 0 ? 0 : undefined }}
                />
              ))}
            </div>

            {segments.map((segment) => {
              const left = (segment.start_ms / durationMs) * 100;
              const width = ((segment.end_ms - segment.start_ms) / durationMs) * 100;
              const selected = segment.key === selectedKey;
              return (
                <div
                  key={segment.key}
                  data-testid="timeline-segment"
                  onPointerDown={(event) =>
                    handleSegmentPointerDown(event, segment)
                  }
                  className={`absolute top-3 h-14 min-w-1 cursor-grab rounded-md border-2 ${
                    selected
                      ? "border-brand-700 bg-brand-200/90"
                      : readOnly
                        ? "border-slate-400 bg-slate-300/80"
                        : "border-brand-600 bg-brand-200/70"
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${formatDuration(segment.start_ms)} – ${formatDuration(
                    segment.end_ms,
                  )}`}
                >
                  {!readOnly ? (
                    <>
                      <div
                        data-handle="left"
                        className="absolute -left-1 top-0 h-full w-2 cursor-ew-resize rounded-l"
                      />
                      <div
                        data-handle="right"
                        className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize rounded-r"
                      />
                    </>
                  ) : null}
                  <div className="pointer-events-none flex h-full items-center justify-center text-[10px] font-medium text-brand-800">
                    {formatDuration(segment.end_ms - segment.start_ms)}
                  </div>
                </div>
              );
            })}

            {preview ? (
              <div
                className="pointer-events-none absolute top-3 h-14 rounded-md border-2 border-dashed border-amber-500 bg-amber-100/70"
                style={{
                  left: `${(preview.start / durationMs) * 100}%`,
                  width: `${((preview.end - preview.start) / durationMs) * 100}%`,
                }}
              />
            ) : null}

            <div
              className="pointer-events-none absolute top-0 z-10 h-full w-px bg-brand-700"
              style={{ left: `${(currentMs / durationMs) * 100}%` }}
            >
              <div className="absolute -left-1.5 -top-0.5 h-3 w-3 rounded-full bg-brand-700" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

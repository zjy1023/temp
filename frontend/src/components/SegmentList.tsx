import { ArrowRight, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { formatTimecode } from "../utils/format";
import type { EditorSegment } from "../utils/segments";

function TimeInput({
  valueMs,
  disabled,
  onCommit,
}: {
  valueMs: number;
  disabled?: boolean;
  onCommit: (ms: number) => void;
}) {
  const [text, setText] = useState((valueMs / 1000).toFixed(3));

  useEffect(() => {
    setText((valueMs / 1000).toFixed(3));
  }, [valueMs]);

  function commit() {
    const seconds = Number(text);
    if (!Number.isFinite(seconds) || seconds < 0) {
      setText((valueMs / 1000).toFixed(3));
      return;
    }
    onCommit(Math.round(seconds * 1000));
  }

  return (
    <input
      type="number"
      min={0}
      step={0.001}
      value={text}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      className="h-8 w-24 rounded-md border border-slate-200 px-2 font-mono text-xs text-slate-700 outline-none focus:border-brand-600 disabled:bg-slate-50 disabled:text-slate-400"
      aria-label="时间（秒）"
    />
  );
}

interface SegmentListProps {
  segments: EditorSegment[];
  selectedKey: string | null;
  readOnly: boolean;
  onSelect: (key: string) => void;
  onSeek: (ms: number) => void;
  onUpdate: (key: string, startMs: number, endMs: number) => void;
  onDelete: (key: string) => void;
}

export function SegmentList({
  segments,
  selectedKey,
  readOnly,
  onSelect,
  onSeek,
  onUpdate,
  onDelete,
}: SegmentListProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">片段列表</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {segments.length} 段 ·{" "}
            {formatTimecode(
              segments.reduce(
                (total, segment) => total + segment.end_ms - segment.start_ms,
                0,
              ),
            )}
          </p>
        </div>
      </div>

      {segments.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">还没有片段</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {segments.map((segment, index) => {
            const selected = segment.key === selectedKey;
            return (
              <div
                key={segment.key}
                onClick={() => onSelect(segment.key)}
                className={`rounded-lg border p-3 transition ${
                  selected
                    ? "border-brand-300 bg-brand-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    片段 {index + 1}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {formatTimecode(segment.end_ms - segment.start_ms)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TimeInput
                    valueMs={segment.start_ms}
                    disabled={readOnly}
                    onCommit={(ms) => onUpdate(segment.key, ms, segment.end_ms)}
                  />
                  <span className="text-xs text-slate-400">→</span>
                  <TimeInput
                    valueMs={segment.end_ms}
                    disabled={readOnly}
                    onCommit={(ms) => onUpdate(segment.key, segment.start_ms, ms)}
                  />
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSeek(segment.start_ms);
                      }}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-white hover:text-brand-700"
                      aria-label="跳转到片段"
                    >
                      <ArrowRight size={14} />
                    </button>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(segment.key);
                        }}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-red-600"
                        aria-label="删除片段"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

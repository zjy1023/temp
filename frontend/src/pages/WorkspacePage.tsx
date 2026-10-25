import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Keyboard,
  Loader2,
  Maximize,
  Pause,
  Play,
  Save,
  Send,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { ApiError, api } from "../api/client";
import type {
  AssignmentDetail,
  DraftOut,
  SubmitOut,
} from "../api/types";
import { Modal } from "../components/Modal";
import { SegmentList } from "../components/SegmentList";
import { ErrorState, Spinner } from "../components/StateViews";
import { StatusBadge } from "../components/StatusBadge";
import { Timeline } from "../components/Timeline";
import {
  formatTimecode,
  formatDateTime,
} from "../utils/format";
import {
  fromApiSegments,
  overlapWith,
  toPayload,
  totalDuration,
  type EditorSegment,
} from "../utils/segments";

type SaveState = "saved" | "unsaved" | "saving" | "error";

export function WorkspacePage() {
  const { assignmentId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const historyRef = useRef<EditorSegment[][]>([]);
  const initializedRef = useRef(false);
  const revisionRef = useRef(0);
  const savingRef = useRef(false);

  const query = useQuery({
    queryKey: ["assignment", assignmentId],
    queryFn: () =>
      api.get<AssignmentDetail>(`/annotator/assignments/${assignmentId}`),
  });

  const [segments, setSegments] = useState<EditorSegment[]>([]);
  const [version, setVersion] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [conflictOpen, setConflictOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [browserDurationMs, setBrowserDurationMs] = useState<number | null>(
    null,
  );
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const data = query.data;
  const readOnly = data?.assignment.status === "SUBMITTED";
  const durationMs = data?.video.duration_ms ?? 0;
  const fps = data?.video.fps ?? null;
  const videoSrc = data ? `/api/videos/${data.video.id}/stream` : undefined;
  const poster = data?.video.poster_url ?? undefined;

  useEffect(() => {
    if (!data || initializedRef.current) return;
    initializedRef.current = true;
    setSegments(fromApiSegments(data.segments));
    setVersion(data.assignment.version);
  }, [data]);

  useEffect(() => {
    if (selectedKey && !segments.some((item) => item.key === selectedKey)) {
      setSelectedKey(null);
    }
  }, [segments, selectedKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.playbackRate = rate;
  }, [volume, rate]);

  useEffect(() => {
    if (!playing) return;
    let frameId = 0;
    const loop = () => {
      if (videoRef.current) {
        setCurrentMs(videoRef.current.currentTime * 1000);
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [playing]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const persistDraft = useCallback(
    async (currentSegments: EditorSegment[], currentVersion: number) => {
      const revision = revisionRef.current;
      const result = await api.put<DraftOut>(
        `/annotator/assignments/${assignmentId}/draft`,
        {
          version: currentVersion,
          segments: toPayload(currentSegments),
        },
      );
      setVersion(result.version);
      if (revisionRef.current === revision) {
        setSegments(fromApiSegments(result.segments));
        setDirty(false);
        setSaveState("saved");
      } else {
        setSaveState("unsaved");
      }
      return result;
    },
    [assignmentId],
  );

  const saveDraft = useCallback(async () => {
    if (!dirty || readOnly || savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      await persistDraft(segments, version);
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        setConflictOpen(true);
        setSaveState("unsaved");
      } else {
        setSaveState("error");
        toast.error(
          error instanceof ApiError ? error.message : "保存失败，请重试",
        );
      }
    } finally {
      savingRef.current = false;
    }
  }, [dirty, persistDraft, readOnly, segments, version]);

  useEffect(() => {
    if (!dirty || readOnly) return;
    const timer = window.setTimeout(() => {
      void saveDraft();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [dirty, readOnly, saveDraft, segments, version]);

  function pushHistory() {
    historyRef.current.push(segments.map((segment) => ({ ...segment })));
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
    }
  }

  function commitSegments(next: EditorSegment[]) {
    pushHistory();
    revisionRef.current += 1;
    setSegments(next);
    setDirty(true);
    setSaveState("unsaved");
  }

  function addSegment(startMs: number, endMs: number) {
    if (endMs <= startMs) {
      toast.error("结束时间必须大于开始时间");
      return;
    }
    if (overlapWith(segments, { start_ms: startMs, end_ms: endMs })) {
      toast.error("与已有片段重叠，请调整起止时间");
      return;
    }
    const created: EditorSegment = {
      key: crypto.randomUUID(),
      start_ms: Math.round(startMs),
      end_ms: Math.round(endMs),
    };
    commitSegments(
      [...segments, created].sort(
        (left, right) => left.start_ms - right.start_ms,
      ),
    );
    setSelectedKey(created.key);
  }

  function updateSegment(key: string, startMs: number, endMs: number) {
    if (endMs <= startMs) {
      toast.error("结束时间必须大于开始时间");
      return;
    }
    if (
      overlapWith(
        segments,
        { start_ms: startMs, end_ms: endMs },
        key,
      )
    ) {
      toast.error("与已有片段重叠，请调整起止时间");
      return;
    }
    commitSegments(
      segments
        .map((segment) =>
          segment.key === key
            ? { ...segment, start_ms: startMs, end_ms: endMs }
            : segment,
        )
        .sort((left, right) => left.start_ms - right.start_ms),
    );
  }

  function deleteSegment(key: string) {
    commitSegments(segments.filter((segment) => segment.key !== key));
    if (selectedKey === key) setSelectedKey(null);
  }

  function undo() {
    const previous = historyRef.current.pop();
    if (!previous) return;
    revisionRef.current += 1;
    setSegments(previous);
    setDirty(true);
    setSaveState("unsaved");
  }

  function seek(ms: number) {
    const clamped = Math.min(Math.max(ms, 0), durationMs);
    if (videoRef.current) {
      videoRef.current.currentTime = clamped / 1000;
    }
    setCurrentMs(clamped);
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }

  function step(deltaMs: number) {
    const video = videoRef.current;
    if (video) video.pause();
    seek(currentMs + deltaMs);
  }

  function markInPoint() {
    const point = currentMs;
    if (markOut !== null && markOut > point) {
      addSegment(point, markOut);
      setMarkIn(null);
      setMarkOut(null);
      return;
    }
    setMarkIn(point);
    setMarkOut(null);
    toast.info(`入点 ${formatTimecode(point)}`);
  }

  function markOutPoint() {
    const point = currentMs;
    if (markIn !== null && point > markIn) {
      addSegment(markIn, point);
      setMarkIn(null);
      setMarkOut(null);
      return;
    }
    setMarkOut(point);
    toast.info(`出点 ${formatTimecode(point)}`);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const tag = target.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        tag === "BUTTON" ||
        target.isContentEditable
      ) {
        return;
      }
      const modifier = event.ctrlKey || event.metaKey;
      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDraft();
        return;
      }
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
        return;
      }
      if (modifier && event.key === "Enter") {
        event.preventDefault();
        if (!readOnly) setSubmitOpen(true);
        return;
      }
      if (readOnly) return;
      if (event.key === "i" || event.key === "I") {
        event.preventDefault();
        markInPoint();
      } else if (event.key === "o" || event.key === "O") {
        event.preventDefault();
        markOutPoint();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(event.shiftKey ? -1000 : -((fps ? 1000 / fps : 100)));
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(event.shiftKey ? 1000 : (fps ? 1000 / fps : 100));
      } else if (event.key === "Delete" || event.key === "Backspace") {
        if (selectedKey) {
          event.preventDefault();
          deleteSegment(selectedKey);
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function handleSubmit() {
    if (readOnly) return;
    if (savingRef.current) {
      toast.info("正在保存草稿，请稍候再提交");
      return;
    }
    setSubmitting(true);
    try {
      let submitVersion = version;
      if (dirty) {
        const result = await persistDraft(segments, version);
        submitVersion = result.version;
      }
      await api.post<SubmitOut>(
        `/annotator/assignments/${assignmentId}/submit`,
        {
          version: submitVersion,
          confirm_empty: segments.length === 0,
        },
      );
      setSubmitOpen(false);
      setDirty(false);
      toast.success("提交成功");
      await query.refetch();
      void queryClient.invalidateQueries({ queryKey: ["annotator-tasks"] });
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "提交失败，请重试",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function reloadLatest() {
    const result = await query.refetch();
    if (result.data) {
      setSegments(fromApiSegments(result.data.segments));
      setVersion(result.data.assignment.version);
      setDirty(false);
      setSaveState("saved");
    }
    setConflictOpen(false);
  }

  if (query.isLoading) {
    return <Spinner label="正在加载标注任务…" />;
  }
  if (query.isError || !data) {
    return (
      <ErrorState
        message={
          query.error instanceof ApiError
            ? query.error.message
            : "任务加载失败"
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  const saveLabel = readOnly
    ? "只读"
    : saveState === "saving"
      ? "保存中…"
      : saveState === "unsaved"
        ? "未保存"
        : saveState === "error"
          ? "保存失败"
          : "已保存";
  const saveClass = readOnly
    ? "bg-slate-100 text-slate-600"
    : saveState === "error"
      ? "bg-red-50 text-red-700"
      : saveState === "unsaved"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";
  const frame = fps ? Math.round((currentMs / 1000) * fps) : null;
  const durationMismatch =
    browserDurationMs !== null &&
    durationMs > 0 &&
    Math.abs(browserDurationMs - durationMs) > 1000;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/tasks")}
            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
            aria-label="返回任务列表"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-lg font-semibold text-slate-900">
                {data.task.title}
              </h1>
              <StatusBadge status={data.assignment.status} />
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {data.video.duration_ms > 0
                ? `视频 ${formatTimecode(durationMs)}`
                : "视频"}
              {fps ? ` · ${fps} fps` : ""}
              {data.assignment.submitted_at
                ? ` · 提交于 ${formatDateTime(data.assignment.submitted_at)}`
                : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${saveClass}`}>
            {saveLabel}
          </span>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => setSubmitOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Send size={15} />
              提交任务
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 size={15} />
              已提交 · {formatTimecode(data.assignment.total_duration_ms ?? 0)}
            </span>
          )}
        </div>
      </div>

      {durationMismatch ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          浏览器解析时长为 {formatTimecode(browserDurationMs ?? 0)}，服务端为{" "}
          {formatTimecode(durationMs)}；标注以服务端时长为准。
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex min-h-[320px] max-h-[58vh] items-center justify-center bg-slate-950">
              <video
                ref={videoRef}
                data-testid="video-player"
                src={videoSrc}
                poster={poster}
                playsInline
                preload="metadata"
                className="h-full max-h-[58vh] w-full object-contain"
                onTimeUpdate={(event) =>
                  setCurrentMs(event.currentTarget.currentTime * 1000)
                }
                onLoadedMetadata={(event) =>
                  setBrowserDurationMs(event.currentTarget.duration * 1000)
                }
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-3">
              <button
                type="button"
                onClick={togglePlay}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
                aria-label={playing ? "暂停" : "播放"}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span className="font-mono text-xs text-slate-600">
                {formatTimecode(currentMs)} / {formatTimecode(durationMs)}
                {frame !== null ? ` · 帧 ${frame}` : ""}
              </span>
              <div className="ml-auto flex items-center gap-2 text-slate-500">
                <Volume2 size={15} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="w-20 accent-teal-700"
                  aria-label="音量"
                />
                <select
                  value={rate}
                  onChange={(event) => setRate(Number(event.target.value))}
                  className="h-8 rounded-md border border-slate-200 px-2 text-xs text-slate-600"
                  aria-label="播放速度"
                >
                  {[0.5, 1, 1.5, 2].map((value) => (
                    <option key={value} value={value}>
                      {value}x
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    void videoRef.current?.parentElement?.requestFullscreen()
                  }
                  className="rounded-md p-1.5 hover:bg-slate-100"
                  aria-label="全屏"
                >
                  <Maximize size={15} />
                </button>
              </div>
            </div>
          </div>

          <Timeline
            durationMs={durationMs}
            currentMs={currentMs}
            segments={segments}
            selectedKey={selectedKey}
            readOnly={Boolean(readOnly)}
            fps={fps}
            onSeek={seek}
            onSelect={setSelectedKey}
            onChange={commitSegments}
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50"
            >
              <Keyboard size={13} />
              快捷键
            </button>
            {markIn !== null ? (
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-700">
                入点 {formatTimecode(markIn)}
              </span>
            ) : null}
            {markOut !== null ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                出点 {formatTimecode(markOut)}
              </span>
            ) : null}
            {!readOnly ? (
              <button
                type="button"
                onClick={() => void saveDraft()}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50"
              >
                <Save size={13} />
                立即保存
              </button>
            ) : null}
            <span className="ml-auto font-mono">
              总时长 {formatTimecode(totalDuration(segments))}
            </span>
          </div>
        </div>

        <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-11rem)]">
          <SegmentList
            segments={segments}
            selectedKey={selectedKey}
            readOnly={Boolean(readOnly)}
            onSelect={setSelectedKey}
            onSeek={seek}
            onUpdate={updateSegment}
            onDelete={deleteSegment}
          />
        </div>
      </div>

      <Modal
        open={submitOpen}
        title="提交任务"
        onClose={() => {
          if (!submitting) setSubmitOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              onClick={() => setSubmitOpen(false)}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <Send size={15} />
              )}
              {submitting ? "提交中…" : "确认提交"}
            </button>
          </>
        }
      >
        {segments.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            没有标注任何片段。提交后有效时长为 0，确认继续？
          </div>
        ) : (
          <div className="space-y-2 text-sm text-slate-600">
            <p>
              共 {segments.length} 个片段，总时长{" "}
              <span className="font-mono font-medium text-slate-900">
                {formatTimecode(totalDuration(segments))}
              </span>
              。
            </p>
            <p className="text-xs text-slate-500">
              提交后任务锁定，不能再修改。
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={conflictOpen}
        title="草稿已在其他窗口修改"
        onClose={() => setConflictOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setConflictOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              稍后处理
            </button>
            <button
              type="button"
              onClick={() => void reloadLatest()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              刷新并加载最新版本
            </button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          另一个窗口已经保存了更新的草稿。刷新会丢弃当前未保存的修改。
        </p>
      </Modal>

      <Modal
        open={showShortcuts}
        title="快捷键"
        onClose={() => setShowShortcuts(false)}
      >
        <div className="space-y-2 text-sm text-slate-600">
          {[
            ["Space", "播放 / 暂停"],
            ["I", "设置入点"],
            ["O", "设置出点"],
            ["← / →", "逐帧（fps 未知时 100ms）"],
            ["Shift + ← / →", "前后 1 秒"],
            ["Delete", "删除选中片段"],
            ["Ctrl/Cmd + Z", "撤销"],
            ["Ctrl/Cmd + S", "立即保存"],
            ["Ctrl/Cmd + Enter", "提交"],
          ].map(([key, description]) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <span className="font-mono text-xs text-slate-700">{key}</span>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

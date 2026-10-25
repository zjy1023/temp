import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Clock3, FileVideo, UserRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { ApiError, api } from "../api/client";
import type { TaskDetail } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { ErrorState, Spinner } from "../components/StateViews";
import { StatusBadge } from "../components/StatusBadge";
import { formatBytes, formatDateTime, formatDuration } from "../utils/format";

function ReadonlyTimeline({
  durationMs,
  segments,
}: {
  durationMs: number;
  segments: TaskDetail["segments"];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">片段位置</h2>
        <span className="text-xs text-slate-500">
          {segments.length} 段 · 视频 {formatDuration(durationMs)}
        </span>
      </div>
      <div className="relative h-16 rounded-lg border border-slate-200 bg-slate-100">
        {segments.map((segment) => (
          <div
            key={segment.id}
            className="absolute top-2 h-12 rounded-md border-2 border-brand-600 bg-brand-200/70"
            style={{
              left: `${(segment.start_ms / durationMs) * 100}%`,
              width: `${((segment.end_ms - segment.start_ms) / durationMs) * 100}%`,
            }}
            title={`${formatDuration(segment.start_ms)} – ${formatDuration(segment.end_ms)}`}
          />
        ))}
        {segments.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            没有片段
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AdminTaskDetailPage() {
  const { taskId = "" } = useParams();
  const query = useQuery({
    queryKey: ["admin-task", taskId],
    queryFn: () => api.get<TaskDetail>(`/admin/tasks/${taskId}`),
  });

  if (query.isLoading) return <Spinner label="正在加载任务详情…" />;
  if (query.isError || !query.data) {
    return (
      <ErrorState
        message={
          query.error instanceof ApiError
            ? query.error.message
            : "任务详情加载失败"
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  const data = query.data;
  const assignment = data.assignment;
  const total = assignment?.total_duration_ms ?? 0;

  return (
    <div>
      <div className="mb-4">
        <Link
          to="/admin/tasks"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={15} />
          返回任务管理
        </Link>
      </div>

      <PageHeader
        title={data.task.title}
        subtitle={data.task.description ?? undefined}
        actions={<StatusBadge status={data.task.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex max-h-[50vh] min-h-[300px] items-center justify-center bg-slate-950">
              <video
                src={`/api/videos/${data.video.id}/stream`}
                poster={data.video.poster_url ?? undefined}
                controls
                preload="metadata"
                className="max-h-[50vh] w-full object-contain"
              />
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <FileVideo size={14} />
                {data.video.original_name}
              </span>
              <span>{formatBytes(data.video.size_bytes)}</span>
            </div>
          </div>

          <ReadonlyTimeline
            durationMs={data.video.duration_ms}
            segments={data.segments}
          />

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">
                已提交片段
              </h2>
            </div>
            {data.segments.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                {assignment?.status === "SUBMITTED"
                  ? "该任务为空提交，没有片段。"
                  : "任务尚未提交，暂时没有片段。"}
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-2">#</th>
                    <th className="px-4 py-2">开始</th>
                    <th className="px-4 py-2">结束</th>
                    <th className="px-4 py-2 text-right">时长</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.segments.map((segment, index) => (
                    <tr key={segment.id}>
                      <td className="px-4 py-2 text-slate-500">{index + 1}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">
                        {formatDuration(segment.start_ms)}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">
                        {formatDuration(segment.end_ms)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs text-slate-700">
                        {formatDuration(segment.end_ms - segment.start_ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">任务信息</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">租户</dt>
              <dd className="text-right text-slate-800">{data.tenant.name}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">视频时长</dt>
              <dd className="text-right font-mono text-xs text-slate-800">
                {formatDuration(data.video.duration_ms)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">帧率</dt>
              <dd className="text-right text-slate-800">
                {data.video.fps ? `${data.video.fps} fps` : "未知"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">编码</dt>
              <dd className="text-right text-slate-800">
                {data.video.codec ?? "未知"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">领取人</dt>
              <dd className="inline-flex items-center gap-1.5 text-right text-slate-800">
                <UserRound size={14} className="text-slate-400" />
                {assignment?.annotator?.display_name ?? "未领取"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-slate-500">提交时间</dt>
              <dd className="text-right text-slate-800">
                {formatDateTime(assignment?.submitted_at ?? null)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-3">
              <dt className="inline-flex items-center gap-1.5 text-slate-500">
                <Clock3 size={14} />
                有效时长
              </dt>
              <dd className="text-right font-mono font-semibold text-slate-900">
                {assignment?.status === "SUBMITTED"
                  ? formatDuration(total)
                  : "—"}
              </dd>
            </div>
          </dl>
          {assignment?.status === "CLAIMED" ? (
            <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              标注员正在标注，尚未提交。未提交不计入有效时长。
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FileVideo, Loader2, PlayCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ApiError, api } from "../api/client";
import type { AnnotatorTasks, ClaimOut } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "../components/StateViews";
import { StatusBadge } from "../components/StatusBadge";
import { formatDuration } from "../utils/format";

type Tab = "available" | "in_progress" | "submitted";

function Poster({ url }: { url: string | null }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="h-36 w-full rounded-lg object-cover"
        loading="lazy"
      />
    );
  }
  return (
    <div className="flex h-36 w-full items-center justify-center rounded-lg bg-slate-100 text-slate-400">
      <FileVideo size={28} />
    </div>
  );
}

export function AnnotatorTasksPage() {
  const [tab, setTab] = useState<Tab>("available");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["annotator-tasks"],
    queryFn: () => api.get<AnnotatorTasks>("/annotator/tasks"),
  });

  const claim = useMutation({
    mutationFn: (taskId: string) =>
      api.post<ClaimOut>(`/annotator/tasks/${taskId}/claim`),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["annotator-tasks"] });
      navigate(`/tasks/${data.assignment.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "领取失败");
      void queryClient.invalidateQueries({ queryKey: ["annotator-tasks"] });
    },
  });

  const available = query.data?.available ?? [];
  const inProgress =
    query.data?.mine.filter((item) => item.status === "CLAIMED") ?? [];
  const submitted =
    query.data?.mine.filter((item) => item.status === "SUBMITTED") ?? [];

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "available", label: "可领取", count: available.length },
    { key: "in_progress", label: "进行中", count: inProgress.length },
    { key: "submitted", label: "已提交", count: submitted.length },
  ];

  return (
    <div>
      <PageHeader title="我的任务" />

      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === item.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {item.label}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {query.isLoading ? <LoadingBlock rows={3} /> : null}
      {query.isError ? (
        <ErrorState
          message={
            query.error instanceof ApiError
              ? query.error.message
              : "任务列表加载失败"
          }
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data ? (
        <>
          {tab === "available" && available.length === 0 ? (
            <EmptyState title="暂时没有可领取的任务" />
          ) : null}
          {tab === "available" && available.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {available.map((task) => (
                <article
                  key={task.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <Poster url={task.video.poster_url} />
                  <div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {task.title}
                    </h3>
                    {task.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {task.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>视频时长 {formatDuration(task.video.duration_ms)}</span>
                    {task.video.fps ? <span>{task.video.fps} fps</span> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => claim.mutate(task.id)}
                    disabled={claim.isPending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                  >
                    {claim.isPending && claim.variables === task.id ? (
                      <Loader2 className="animate-spin" size={15} />
                    ) : (
                      <PlayCircle size={15} />
                    )}
                    领取任务
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {tab === "in_progress" && inProgress.length === 0 ? (
            <EmptyState
              title="没有进行中的任务"
            />
          ) : null}
          {tab === "in_progress" && inProgress.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {inProgress.map((task) => (
                <article
                  key={task.assignment_id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <Poster url={task.video.poster_url} />
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {task.title}
                    </h3>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="text-xs text-slate-500">
                    已标 {task.segment_count} 段 · 时长{" "}
                    {formatDuration(task.video.duration_ms)}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/tasks/${task.assignment_id}`)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
                  >
                    继续标注
                    <ArrowRight size={15} />
                  </button>
                </article>
              ))}
            </div>
          ) : null}

          {tab === "submitted" && submitted.length === 0 ? (
            <EmptyState
              title="还没有已提交的任务"
            />
          ) : null}
          {tab === "submitted" && submitted.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {submitted.map((task) => (
                <article
                  key={task.assignment_id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4"
                >
                  <Poster url={task.video.poster_url} />
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">
                      {task.title}
                    </h3>
                    <StatusBadge status={task.status} />
                  </div>
                  <div className="text-xs text-slate-500">
                    有效时长{" "}
                    {formatDuration(task.total_duration_ms ?? 0)} ·{" "}
                    {task.segment_count} 段
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/tasks/${task.assignment_id}`)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    查看提交
                    <ArrowRight size={15} />
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

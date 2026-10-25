import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ApiError, api, withQuery } from "../api/client";
import type { TaskStatus, TaskSummary, Video } from "../api/types";
import { useTenant } from "../auth/TenantContext";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "../components/StateViews";
import { StatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatDuration } from "../utils/format";

const statusOptions: { value: TaskStatus | ""; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "PUBLISHED", label: "可领取" },
  { value: "CLAIMED", label: "进行中" },
  { value: "SUBMITTED", label: "已提交" },
];

export function AdminTasksPage() {
  const { selectedTenantId, selectedTenant, isPlatformAdmin } = useTenant();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [videoId, setVideoId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["admin-tasks", selectedTenantId, status],
    queryFn: () =>
      api.get<{ tasks: TaskSummary[] }>(
        withQuery("/admin/tasks", {
          tenant_id: isPlatformAdmin ? selectedTenantId : undefined,
          status: status || undefined,
        }),
      ),
  });

  const videosQuery = useQuery({
    queryKey: ["admin-videos", selectedTenantId, "create-task"],
    queryFn: () =>
      api.get<Video[]>(
        withQuery("/admin/videos", {
          tenant_id: isPlatformAdmin ? selectedTenantId : undefined,
        }),
      ),
    enabled: createOpen,
  });

  const createTask = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/admin/tasks", {
        tenant_id: isPlatformAdmin ? selectedTenantId : undefined,
        video_id: videoId,
        title: title.trim(),
        description: description.trim() || null,
      }),
    onSuccess: () => {
      toast.success("任务已发布");
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setVideoId("");
      void queryClient.invalidateQueries({ queryKey: ["admin-tasks"] });
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError ? error.message : "发布任务失败",
      );
    },
  });

  useEffect(() => {
    setVideoId("");
  }, [selectedTenantId]);

  useEffect(() => {
    if (!createOpen) return;
    const first = videosQuery.data?.[0];
    if (first && !videoId) {
      setVideoId(first.id);
    }
  }, [createOpen, videoId, videosQuery.data]);

  function openCreate() {
    setFormError(null);
    setCreateOpen(true);
  }

  const tasks = tasksQuery.data?.tasks ?? [];

  return (
    <div>
      <PageHeader
        title="任务管理"
        subtitle={selectedTenant?.name}
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <Plus size={16} />
            发布任务
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as TaskStatus | "")
          }
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-500">
          共 {tasks.length} 个任务
        </span>
      </div>

      {tasksQuery.isLoading ? <LoadingBlock rows={4} /> : null}
      {tasksQuery.isError ? (
        <ErrorState
          message={
            tasksQuery.error instanceof ApiError
              ? tasksQuery.error.message
              : "任务列表加载失败"
          }
          onRetry={() => void tasksQuery.refetch()}
        />
      ) : null}
      {tasksQuery.data && tasks.length === 0 ? (
        <EmptyState
          title="还没有任务"
          description="上传视频后即可发布任务。"
          icon={<ClipboardList size={22} />}
          action={
            <Link
              to="/admin/videos"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              去视频库
            </Link>
          }
        />
      ) : null}

      {tasks.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3">任务</th>
                  <th className="px-4 py-3">租户</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">领取人</th>
                  <th className="px-4 py-3">提交时间</th>
                  <th className="px-4 py-3 text-right">有效时长</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {task.title}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        视频 {formatDuration(task.video.duration_ms)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {task.tenant_name}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {task.annotator?.display_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDateTime(task.submitted_at)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                      {task.total_duration_ms !== null
                        ? formatDuration(task.total_duration_ms)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/admin/tasks/${task.id}`)
                        }
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <Modal
        open={createOpen}
        title="发布标注任务"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => createTask.mutate()}
              disabled={
                createTask.isPending ||
                !title.trim() ||
                !videoId ||
                (isPlatformAdmin && !selectedTenantId)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {createTask.isPending ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <Plus size={15} />
              )}
              发布
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {isPlatformAdmin ? (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              当前租户：{selectedTenant?.name ?? "未选择"}
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              任务标题
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
              placeholder="例如：咖啡制作演示片段标注"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-brand-600"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              描述（可选）
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="标出抓取、移动、放置三个阶段"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              视频
            </span>
            <select
              value={videoId}
              onChange={(event) => setVideoId(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="">选择视频</option>
              {(videosQuery.data ?? []).map((video) => (
                <option key={video.id} value={video.id}>
                  {video.original_name} · {formatDuration(video.duration_ms)}
                </option>
              ))}
            </select>
            {videosQuery.isLoading ? (
              <span className="mt-1 block text-xs text-slate-500">
                正在加载视频…
              </span>
            ) : null}
            {!videosQuery.isLoading && (videosQuery.data?.length ?? 0) === 0 ? (
              <span className="mt-1 block text-xs text-amber-700">
                当前租户还没有视频，请先到视频库上传。
              </span>
            ) : null}
          </label>
          {formError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileVideo, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ApiError, api, uploadVideo, withQuery } from "../api/client";
import type { Video } from "../api/types";
import { useTenant } from "../auth/TenantContext";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, LoadingBlock } from "../components/StateViews";
import { formatBytes, formatDateTime, formatDuration } from "../utils/format";

export function AdminVideosPage() {
  const { selectedTenantId, selectedTenant, isPlatformAdmin } = useTenant();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadName, setUploadName] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["admin-videos", selectedTenantId],
    queryFn: () =>
      api.get<Video[]>(
        withQuery("/admin/videos", {
          tenant_id: isPlatformAdmin ? selectedTenantId : undefined,
        }),
      ),
  });

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!/\.(mp4|webm)$/i.test(file.name)) {
      toast.error("只支持 MP4 或 WebM");
      return;
    }
    setUploading(true);
    setProgress(0);
    setUploadName(file.name);
    try {
      await uploadVideo(
        file,
        isPlatformAdmin ? selectedTenantId : undefined,
        setProgress,
      );
      toast.success("视频上传完成");
      await queryClient.invalidateQueries({ queryKey: ["admin-videos"] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "上传失败");
    } finally {
      setUploading(false);
      setUploadName(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const videos = query.data ?? [];

  return (
    <div>
      <PageHeader
        title="视频库"
        subtitle={
          selectedTenant
            ? `${selectedTenant.name} · 上传与管理任务视频`
            : "上传与管理任务视频"
        }
        actions={
          <>
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/webm"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || (isPlatformAdmin && !selectedTenantId)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Upload size={16} />
              )}
              上传视频
            </button>
          </>
        }
      />

      {uploading ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-4">
          <div className="flex items-center justify-between text-sm text-brand-800">
            <span className="truncate">{uploadName}</span>
            <span className="font-mono">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
            <div
              className="h-full rounded-full bg-brand-600 transition"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-brand-700">
            大文件上传中，请不要关闭页面。
          </p>
        </div>
      ) : null}

      {query.isLoading ? <LoadingBlock rows={4} /> : null}
      {query.isError ? (
        <ErrorState
          message={
            query.error instanceof ApiError
              ? query.error.message
              : "视频列表加载失败"
          }
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && videos.length === 0 ? (
        <EmptyState
          title="还没有视频"
          description="上传一个 MP4/WebM，或在本地运行脚本生成演示视频后上传。"
          icon={<FileVideo size={22} />}
        />
      ) : null}

      {videos.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-3">视频</th>
                  <th className="px-4 py-3">时长</th>
                  <th className="px-4 py-3">帧率</th>
                  <th className="px-4 py-3">编码</th>
                  <th className="px-4 py-3">大小</th>
                  <th className="px-4 py-3">上传时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {videos.map((video) => (
                  <tr key={video.id}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {video.poster_url ? (
                          <img
                            src={video.poster_url}
                            alt=""
                            className="h-12 w-20 rounded-md object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-12 w-20 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                            <FileVideo size={18} />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-900">
                            {video.original_name}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                            {video.id.slice(0, 8)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">
                      {formatDuration(video.duration_ms)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {video.fps ? `${video.fps} fps` : "未知"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {video.codec ?? "未知"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatBytes(video.size_bytes)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatDateTime(video.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

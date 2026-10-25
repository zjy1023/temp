import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, Clock3, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, api, withQuery } from "../api/client";
import type { StatsOut } from "../api/types";
import { useTenant } from "../auth/TenantContext";
import { PageHeader } from "../components/PageHeader";
import { EmptyState, ErrorState, Spinner } from "../components/StateViews";
import {
  daysAgoISO,
  formatDuration,
  formatHours,
  todayISO,
} from "../utils/format";

export function AdminStatsPage() {
  const { selectedTenantId, selectedTenant, isPlatformAdmin } = useTenant();
  const [dateFrom, setDateFrom] = useState(daysAgoISO(6));
  const [dateTo, setDateTo] = useState(todayISO());

  const query = useQuery({
    queryKey: ["admin-stats", selectedTenantId, dateFrom, dateTo],
    queryFn: () =>
      api.get<StatsOut>(
        withQuery("/admin/stats/daily", {
          from: dateFrom,
          to: dateTo,
          tenant_id: isPlatformAdmin ? selectedTenantId : undefined,
        }),
      ),
  });

  const data = query.data;
  const days = data?.days ?? [];
  const totalDuration = days.reduce(
    (total, day) => total + day.total_duration_ms,
    0,
  );
  const totalTasks = days.reduce((total, day) => total + day.task_count, 0);
  const daysWithData = days.filter((day) => day.task_count > 0).length;
  const peakAnnotators = days.reduce(
    (peak, day) => Math.max(peak, day.annotator_count),
    0,
  );
  const today = days.find((day) => day.date === todayISO());
  const maxDuration = Math.max(
    ...days.map((day) => day.total_duration_ms),
    1,
  );
  const labelStep = Math.max(1, Math.ceil(days.length / 8));

  function applyRange() {
    if (dateFrom > dateTo) {
      toast.error("开始日期不能晚于结束日期");
    }
  }

  return (
    <div>
      <PageHeader
        title="工作量统计"
        subtitle={
          selectedTenant
            ? `${selectedTenant.name} · 按提交日汇总已提交任务的有效时长`
            : "按提交日汇总已提交任务的有效时长"
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
            <CalendarDays size={13} />
            开始日期
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            onBlur={applyRange}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            结束日期
          </span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            onBlur={applyRange}
            className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-700"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDateFrom(todayISO());
              setDateTo(todayISO());
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            今天
          </button>
          <button
            type="button"
            onClick={() => {
              setDateFrom(daysAgoISO(6));
              setDateTo(todayISO());
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            最近 7 天
          </button>
          <button
            type="button"
            onClick={() => {
              setDateFrom(daysAgoISO(29));
              setDateTo(todayISO());
            }}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
          >
            最近 30 天
          </button>
        </div>
        <span className="ml-auto text-xs text-slate-500">
          时区：{data?.timezone ?? "Asia/Shanghai"}
        </span>
      </div>

      {query.isLoading ? <Spinner label="正在统计…" /> : null}
      {query.isError ? (
        <ErrorState
          message={
            query.error instanceof ApiError
              ? query.error.message
              : "统计加载失败"
          }
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "区间有效时长",
                value: formatHours(totalDuration),
                icon: Clock3,
              },
              {
                label: "已提交任务",
                value: `${totalTasks} 个`,
                icon: BarChart3,
              },
              {
                label: "有数据天数",
                value: `${daysWithData} 天`,
                icon: CalendarDays,
              },
              {
                label: "今日时长",
                value: formatHours(today?.total_duration_ms ?? 0),
                icon: Users,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Icon size={14} />
                    {item.label}
                  </div>
                  <div className="mt-2 text-xl font-semibold text-slate-900">
                    {item.value}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                每日有效时长
              </h2>
              <span className="text-xs text-slate-500">
                峰值标注员 {peakAnnotators} 人
              </span>
            </div>
            {totalDuration === 0 ? (
              <EmptyState
                title="所选区间没有已提交任务"
                description="换一个日期范围，或等待标注员提交任务。"
                icon={<BarChart3 size={22} />}
              />
            ) : (
              <>
                <div className="flex h-56 items-end gap-1.5 border-b border-slate-200 pb-2">
                  {days.map((day, index) => {
                    const height = Math.max(
                      (day.total_duration_ms / maxDuration) * 100,
                      day.total_duration_ms > 0 ? 4 : 1,
                    );
                    const showLabel =
                      index % labelStep === 0 || index === days.length - 1;
                    return (
                      <div
                        key={day.date}
                        className="group flex h-full flex-1 flex-col items-center justify-end"
                        title={`${day.date} · ${formatDuration(
                          day.total_duration_ms,
                        )} · ${day.task_count} 个任务`}
                      >
                        <div
                          className={`w-full rounded-t transition ${
                            day.total_duration_ms > 0
                              ? "bg-brand-600 group-hover:bg-brand-700"
                              : "bg-slate-200"
                          }`}
                          style={{ height: `${height}%` }}
                        />
                        <span className="mt-1 h-4 text-[10px] text-slate-400">
                          {showLabel ? day.date.slice(5) : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                      <tr>
                        <th className="px-3 py-2">日期</th>
                        <th className="px-3 py-2 text-right">有效时长</th>
                        <th className="px-3 py-2 text-right">任务数</th>
                        <th className="px-3 py-2 text-right">标注员数</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {days.map((day) => (
                        <tr key={day.date}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-600">
                            {day.date}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-slate-700">
                            {formatDuration(day.total_duration_ms)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">
                            {day.task_count}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">
                            {day.annotator_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

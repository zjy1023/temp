import type { AssignmentStatus, TaskStatus } from "../api/types";

type Status = TaskStatus | AssignmentStatus;

const styles: Record<Status, string> = {
  PUBLISHED: "border-sky-200 bg-sky-50 text-sky-700",
  CLAIMED: "border-amber-200 bg-amber-50 text-amber-700",
  SUBMITTED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  ARCHIVED: "border-slate-200 bg-slate-100 text-slate-600",
  RELEASED: "border-slate-200 bg-slate-100 text-slate-600",
};

const labels: Record<Status, string> = {
  PUBLISHED: "可领取",
  CLAIMED: "进行中",
  SUBMITTED: "已提交",
  ARCHIVED: "已归档",
  RELEASED: "已释放",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

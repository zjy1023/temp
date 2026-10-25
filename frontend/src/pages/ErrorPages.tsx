import { ShieldAlert, FileQuestion } from "lucide-react";
import { Link } from "react-router-dom";

function ErrorShell({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          {icon}
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{description}</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}

export function ForbiddenPage() {
  return (
    <ErrorShell
      icon={<ShieldAlert size={22} />}
      title="没有权限访问这个页面"
      description="当前账号的角色不允许访问该资源。"
    />
  );
}

export function NotFoundPage() {
  return (
    <ErrorShell
      icon={<FileQuestion size={22} />}
      title="页面或资源不存在"
      description="链接可能已失效，或者你没有访问权限。"
    />
  );
}

import { FileVideo, Loader2, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { ApiError } from "../api/client";
import { homePath, useAuth } from "../auth/AuthContext";

const demoAccounts = [
  {
    label: "平台管理员",
    email: "platform@example.com",
    password: "Platform123!",
    hint: "跨租户查看与发布",
  },
  {
    label: "租户管理员",
    email: "admin.alpha@example.com",
    password: "Admin123!",
    hint: "Alpha 租户管理",
  },
  {
    label: "标注员",
    email: "ann.alpha1@example.com",
    password: "Annotator123!",
    hint: "领取与标注",
  },
];

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("ann.alpha1@example.com");
  const [password, setPassword] = useState("Annotator123!");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={homePath(user)} replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const current = await login(email.trim(), password);
      navigate(homePath(current), { replace: true });
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "登录失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[1.05fr_1fr]">
        <section className="hidden flex-col justify-between bg-brand-50 p-10 md:flex">
          <div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
              <FileVideo size={22} />
            </div>
            <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-900">
              视频片段标注平台
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">
              管理员发布任务，标注员在视频上标出有效片段，系统按提交日汇总有效时长。
            </p>
          </div>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              多租户隔离，后端强制校验
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              时间段不重叠，提交后锁定
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
              每日有效时长按提交日归集
            </div>
          </div>
        </section>

        <section className="p-8 sm:p-10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">登录</h2>
            <p className="mt-1 text-sm text-slate-500">
              使用演示账号，或输入你自己的账号。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                邮箱
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                密码
              </span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                required
              />
            </label>

            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <LogIn size={16} />
              )}
              {submitting ? "登录中…" : "登录"}
            </button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 text-xs font-medium text-slate-500">
              演示账号（仅本地演示）
            </div>
            <div className="space-y-1.5">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white"
                >
                  <span>
                    <span className="font-medium text-slate-700">
                      {account.label}
                    </span>
                    <span className="ml-2 text-slate-400">{account.hint}</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {account.email}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

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
  },
  {
    label: "租户管理员",
    email: "admin.alpha@example.com",
    password: "Admin123!",
  },
  {
    label: "标注员",
    email: "ann.alpha1@example.com",
    password: "Annotator123!",
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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] md:grid-cols-[1.1fr_1fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-teal-900 p-10 text-white md:flex">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.16),transparent_55%)]" />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <FileVideo size={20} />
            </div>
            <span className="text-base font-semibold tracking-wide">
              视频片段标注
            </span>
          </div>

          <div className="relative z-10">
            <div className="relative h-28">
              <div className="absolute inset-x-0 top-6 h-1.5 rounded-full bg-white/15" />
              <div className="absolute left-[6%] top-4 h-5 w-[22%] rounded bg-white/85" />
              <div className="absolute left-[34%] top-4 h-5 w-[15%] rounded bg-white/55" />
              <div className="absolute left-[55%] top-4 h-5 w-[30%] rounded bg-white/75" />
              <div className="absolute left-[47%] top-0 h-14 w-0.5 bg-white" />
              <div className="absolute left-[47%] top-0 h-3 w-3 -translate-x-1/2 rounded-full bg-white shadow" />
            </div>
            <div className="mt-8 flex items-baseline gap-2 font-mono text-sm text-white/70">
              <span>00:00:04.464</span>
              <span className="text-white/30">/</span>
              <span>00:01:00.000</span>
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-2 text-[11px] text-white/40">
            <span className="h-px w-6 bg-white/30" />
            Asia/Shanghai
          </div>
        </section>

        <section className="p-8 sm:p-10">
          <h1 className="text-xl font-semibold text-slate-900">登录</h1>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
              演示账号
            </div>
            <div className="space-y-1">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError(null);
                  }}
                  className="flex w-full flex-col rounded-lg px-2 py-1.5 text-left transition hover:bg-white"
                >
                  <span className="text-xs font-medium text-slate-700">
                    {account.label}
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

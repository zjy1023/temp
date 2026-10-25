import {
  BarChart3,
  ClipboardList,
  FileVideo,
  LogOut,
  MonitorPlay,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { useTenant } from "../auth/TenantContext";

const roleLabels = {
  PLATFORM_ADMIN: "平台管理员",
  TENANT_ADMIN: "租户管理员",
  ANNOTATOR: "标注员",
};

export function AppShell() {
  const { user, logout } = useAuth();
  const {
    tenants,
    selectedTenantId,
    setSelectedTenantId,
    isPlatformAdmin,
    loading,
  } = useTenant();
  const navigate = useNavigate();

  if (!user) return null;

  const adminNav = [
    { to: "/admin/tasks", label: "任务管理", icon: ClipboardList },
    { to: "/admin/videos", label: "视频库", icon: FileVideo },
    { to: "/admin/stats", label: "工作量统计", icon: BarChart3 },
  ];
  const annotatorNav = [
    { to: "/tasks", label: "我的任务", icon: MonitorPlay },
  ];
  const navigation = user.role === "ANNOTATOR" ? annotatorNav : adminNav;

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <FileVideo size={18} />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">片段标注</div>
            <div className="text-xs text-slate-500">Video Annotation</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`
                }
              >
                <Icon size={17} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-4 text-xs text-slate-400">
          每日标注 · 按提交日汇总
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <FileVideo size={16} />
            </div>
            <span className="text-sm font-semibold">片段标注</span>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <span className="text-sm text-slate-500">当前租户</span>
            {isPlatformAdmin ? (
              <select
                value={selectedTenantId ?? ""}
                onChange={(event) => setSelectedTenantId(event.target.value)}
                disabled={loading || tenants.length === 0}
                className="h-9 min-w-48 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-brand-600"
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                {user.tenant?.name ?? "未绑定租户"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium text-slate-900">
                {user.display_name}
              </div>
              <div className="text-xs text-slate-500">
                {roleLabels[user.role]}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <LogOut size={14} />
              退出
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  Binoculars,
  BookOpenText,
  DatabaseZap,
  LayoutDashboard,
  Radar,
  Search,
  Star,
} from 'lucide-react';
import { APP_ROUTES } from '@/lib/appPaths';

const navItems = [
  { to: APP_ROUTES.dashboard, label: '总览', icon: LayoutDashboard },
  { to: APP_ROUTES.reports, label: '报告阅读', icon: BookOpenText },
  { to: APP_ROUTES.search, label: '精确搜索', icon: Search },
  { to: APP_ROUTES.targets, label: '标的分析', icon: Binoculars },
  { to: APP_ROUTES.radar, label: '研究雷达', icon: Radar },
  { to: APP_ROUTES.watchlist, label: '关注列表', icon: Star },
  { to: APP_ROUTES.manage, label: '索引管理', icon: DatabaseZap },
];

const mobilePrimaryNavPaths = new Set<string>([
  APP_ROUTES.dashboard,
  APP_ROUTES.reports,
  APP_ROUTES.search,
  APP_ROUTES.targets,
  APP_ROUTES.manage,
]);

const mobilePrimaryNav = navItems.filter((item) => mobilePrimaryNavPaths.has(item.to));

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f3eee4] text-slate-900">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(196,135,58,0.18),transparent_28%),radial-gradient(circle_at_88%_18%,rgba(45,156,219,0.16),transparent_24%),linear-gradient(135deg,#f8f3ea,#eef4f6_55%,#f5efe3)]" />
      <aside className="fixed left-0 top-0 hidden h-screen w-72 border-r border-white/50 bg-[#102033]/95 p-5 text-white shadow-2xl lg:block">
        <div className="rounded-[28px] border border-white/10 bg-white/8 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-200">Research Desk</div>
          <h1 className="mt-3 text-2xl font-semibold leading-tight">机构日报分析平台</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">本地 Markdown 报告库、标的追踪与研究雷达。</p>
        </div>
        <nav className="mt-6 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                    isActive
                      ? 'bg-amber-200 text-slate-950 shadow-lg shadow-amber-950/10'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="lg:ml-72">
        <header className="sticky top-0 z-20 border-b border-white/60 bg-[#f7f1e8]/80 px-4 py-3 backdrop-blur lg:hidden">
          <div className="font-semibold">机构日报分析平台</div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${isActive ? 'bg-slate-950 text-white' : 'bg-white text-slate-600'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-3 pb-28 pt-5 sm:px-6 lg:px-8 lg:py-10">{children}</main>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-[24px] border border-white/70 bg-[#102033]/95 p-2 text-white shadow-2xl shadow-slate-950/20 backdrop-blur lg:hidden">
        {mobilePrimaryNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] transition ${
                  isActive ? 'bg-amber-200 text-slate-950' : 'text-slate-300'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span>{item.label.replace('报告阅读', '报告').replace('精确搜索', '搜索').replace('标的分析', '标的').replace('索引管理', '更新')}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-7">
      <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-700">{eyebrow}</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
    </div>
  );
}

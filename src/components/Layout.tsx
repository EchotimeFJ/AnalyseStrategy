import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Bot,
  Binoculars,
  BookOpenText,
  DatabaseZap,
  Home,
  Search,
  Star,
} from 'lucide-react';
import { primaryRoutes, routes, secondaryRoutes, type RouteId } from '@/lib/navigation';

const icons: Record<RouteId, typeof Home> = {
  today: Home,
  reports: BookOpenText,
  search: Search,
  company: Binoculars,
  assistant: Bot,
  watchlist: Star,
  data: DatabaseZap,
};

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const currentRoute = routes
    .slice()
    .sort((left, right) => right.path.length - left.path.length)
    .find((route) => route.path === '/' ? location.pathname === '/' : location.pathname.startsWith(route.path));
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-[var(--text)]">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_12%_8%,rgba(37,99,235,0.08),transparent_30%),radial-gradient(circle_at_92%_14%,rgba(16,185,129,0.07),transparent_25%)]" />
      <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur lg:flex lg:flex-col">
        <div className="rounded-2xl bg-slate-950 p-4 text-white">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300">Research Workspace</div>
          <h1 className="mt-2 text-lg font-semibold leading-tight">机构研究工作台</h1>
          <p className="mt-2 text-xs leading-5 text-slate-300">从日报速览到公司观点追踪</p>
        </div>
        <nav className="mt-5 flex-1 space-y-1">
          {routes.map((item, index) => {
            const Icon = icons[item.id];
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${index === primaryRoutes.length ? 'mt-4 border-t border-slate-100 pt-4' : ''} ${
                    isActive
                      ? 'bg-slate-950 font-semibold text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-slate-100 pt-4 text-xs text-slate-400">
          <div>AnalyseStrategy v{__APP_VERSION__}</div>
          <div className="mt-1 font-mono">{__GIT_COMMIT__}</div>
          <div className="mt-1">报告内容仅作研究参考</div>
        </div>
      </aside>
      <div className="lg:ml-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">机构研究工作台</div>
              <div className="font-semibold text-slate-950">{currentRoute?.label ?? '今日速览'}</div>
            </div>
            <div className="flex gap-2">
              {secondaryRoutes.map((item) => (
                <NavLink key={item.id} to={item.path} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                  {item.mobileLabel}
                </NavLink>
              ))}
            </div>
          </div>
          <div className="sr-only">
            {routes.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </header>
        <main className="page-enter mx-auto max-w-[1440px] px-3 pb-28 pt-5 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
      <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-2xl shadow-slate-950/15 backdrop-blur lg:hidden">
        {primaryRoutes.map((item) => {
          const Icon = icons[item.id];
          return (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] transition ${
                  isActive ? 'bg-slate-950 font-semibold text-white' : 'text-slate-500'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              <span>{item.mobileLabel}</span>
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
      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-700">{eyebrow}</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
    </div>
  );
}

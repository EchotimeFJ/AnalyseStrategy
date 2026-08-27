export type RouteId = 'today' | 'reports' | 'search' | 'company' | 'assistant' | 'watchlist' | 'data';

export type AppRouteMeta = {
  id: RouteId;
  path: string;
  label: string;
  mobileLabel: string;
  description: string;
  nav: 'primary' | 'secondary';
};

export const routes: AppRouteMeta[] = [
  { id: 'today', path: '/', label: '今日速览', mobileLabel: '今日', description: '快速查看最新报告与积极观点', nav: 'primary' },
  { id: 'reports', path: '/reports', label: '报告库', mobileLabel: '报告', description: '浏览报告速览和 Markdown 原文', nav: 'primary' },
  { id: 'search', path: '/search', label: '智能检索', mobileLabel: '检索', description: '搜索公司、代码、机构与原文', nav: 'primary' },
  { id: 'company', path: '/company', label: '公司研究', mobileLabel: '公司', description: '查看单一公司的历史观点', nav: 'primary' },
  { id: 'assistant', path: '/assistant', label: '研究助手', mobileLabel: 'AI', description: '基于报告内容进行可追溯问答', nav: 'primary' },
  { id: 'watchlist', path: '/watchlist', label: '关注列表', mobileLabel: '关注', description: '跟踪重点公司的新增变化', nav: 'secondary' },
  { id: 'data', path: '/manage', label: '数据更新', mobileLabel: '更新', description: '更新报告、重建索引与检查质量', nav: 'secondary' },
];

export const routeById = Object.fromEntries(routes.map((route) => [route.id, route])) as Record<RouteId, AppRouteMeta>;
export const primaryRoutes = routes.filter((route) => route.nav === 'primary');
export const secondaryRoutes = routes.filter((route) => route.nav === 'secondary');

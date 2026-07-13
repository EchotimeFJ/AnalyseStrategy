export const APP_BASE_PATH = '/analyse-strategy/';
export const APP_BASENAME = '/analyse-strategy';

export const APP_ROUTES = {
  dashboard: '/',
  reports: '/reports',
  search: '/search',
  targets: '/targets',
  radar: '/radar',
  institutions: '/institutions',
  watchlist: '/watchlist',
  manage: '/manage',
  legacyIndex: '/index',
} as const;

export function appRoute(path: string) {
  return path === APP_ROUTES.legacyIndex ? APP_ROUTES.manage : path;
}

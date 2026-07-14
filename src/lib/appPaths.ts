export const APP_BASE_PATH = '/analyse-strategy/';
export const APP_BASENAME = '/analyse-strategy';

export const APP_ROUTES = {
  dashboard: '/',
  reports: '/reports',
  search: '/search',
  targets: '/targets',
  radar: '/radar',
  watchlist: '/watchlist',
  manage: '/manage',
  legacyIndex: '/index',
  legacyInstitutions: '/institutions',
} as const;

export function appRoute(path: string) {
  if (path === APP_ROUTES.legacyIndex) {
    return APP_ROUTES.manage;
  }
  if (path === APP_ROUTES.legacyInstitutions) {
    return APP_ROUTES.dashboard;
  }

  return path;
}

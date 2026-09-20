import assert from 'node:assert/strict';
import { primaryRoutes, routeById, routes } from '../src/lib/navigation';

assert.equal(routeById.company.label, '公司研究');
assert.equal(routeById.company.mobileLabel, '公司');
assert.equal(routeById.today.label, '今日速览');
assert.equal(routeById.assistant.label, '研究助手');
assert.equal(routes.some((route) => route.label.includes('标的') || route.label.includes('指标')), false);
assert.equal(routes.some((route) => route.path === '/radar'), false);
assert.deepEqual(primaryRoutes.map((route) => route.id), ['today', 'reports', 'search', 'company', 'assistant']);

console.log('navigation tests passed');

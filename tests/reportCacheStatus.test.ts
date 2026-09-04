import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportCacheStatus } from '../src/components/ReportCacheStatus';

const render = (cache: Parameters<typeof ReportCacheStatus>[0]['cache']) => renderToStaticMarkup(createElement(ReportCacheStatus, { cache }));
assert.match(render({ origin: 'rebuilt', persisted: true }), /服务器缓存已保存/);
assert.match(render({ origin: 'disk', persisted: true }), /已从服务器缓存恢复/);
assert.match(render({ origin: 'rebuilt', persisted: false, warning: '磁盘暂不可写' }), /磁盘暂不可写/);
assert.equal(render(undefined), '');
console.log('report cache status tests passed');

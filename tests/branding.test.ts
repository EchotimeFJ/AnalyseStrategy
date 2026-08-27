import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const iconHref = indexHtml.match(/<link\s+rel="icon"[^>]+href="([^"]+)"/i)?.[1];

assert.equal(
  iconHref,
  './research-workbench-mark.svg',
  'the browser tab must use the AnalyseStrategy icon with a cache-busting filename',
);

const iconSvg = readFileSync(
  new URL('../public/research-workbench-mark.svg', import.meta.url),
  'utf8',
);

assert.match(iconSvg, /<title>AnalyseStrategy research workbench<\/title>/);
assert.doesNotMatch(
  iconSvg,
  /M26\.6677 23\.7149H8\.38057/,
  'the previous template mark must not be shipped',
);

console.log('branding tests passed');

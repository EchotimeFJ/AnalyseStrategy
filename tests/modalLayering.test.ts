import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const css = await fs.readFile(new URL('../src/index.css', import.meta.url), 'utf-8');

assert.match(
  css,
  /@keyframes page-enter\s*\{[\s\S]*?to\s*\{[^}]*transform:\s*none;/,
  '页面入场完成后必须释放 transform，避免手机端弹窗被底部导航覆盖',
);
assert.doesNotMatch(
  css,
  /\.page-enter\s*\{[^}]*animation:[^;]*(?:both|forwards)/,
  '页面入场动画不能在结束后保留 transform 的动画填充状态',
);

console.log('modal layering tests passed');

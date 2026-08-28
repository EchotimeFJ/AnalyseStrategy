import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { BackToTopButton } from '../src/components/BackToTopButton';

const html = renderToStaticMarkup(createElement(BackToTopButton));

assert.match(html, /<button[^>]*aria-label="返回顶部"/);
assert.match(html, />返回顶部<\/span>/);
assert.match(html, />平滑返回<\/span>/);

console.log('back to top button tests passed');

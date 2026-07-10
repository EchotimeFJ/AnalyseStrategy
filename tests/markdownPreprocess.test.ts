import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';

import { protectReportMarkdown } from '../src/lib/markdownPreprocess';

const markdown = `模型更新 —— 我们的==目标价定为 39 元/股。维持买入评级。
==
人民币 60.000`;

const rawTree = unified().use(remarkParse).parse(markdown);
assert.equal(rawTree.children[0]?.type, 'heading');
assert.equal(rawTree.children[0]?.depth, 1);

const protectedTree = unified().use(remarkParse).parse(protectReportMarkdown(markdown));
assert.equal(protectedTree.children[0]?.type, 'paragraph');
assert.match(JSON.stringify(protectedTree), /目标价定为 39 元\/股/);
assert.match(JSON.stringify(protectedTree), /==/);

console.log('markdown preprocess tests passed');

import assert from 'node:assert/strict';
import { test } from 'node:test';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { marked } from 'marked';
import { createRequire } from 'node:module';
import { addTableMarkdownRule } from '../src/table-markdown.js';

const require = createRequire(import.meta.url);
const { createDocument } = require('@mixmark-io/domino');
const converter = new TurndownService();
converter.use(gfm);
addTableMarkdownRule(converter);

function roundTrip(html) {
  const markdown = converter.turndown(html);
  assert.doesNotMatch(markdown, /<\/?(?:table|tbody|thead|tr|td|th)\b/i);
  const rendered = marked.parse(markdown, { gfm: true });
  const table = createDocument(rendered).querySelector('table');
  assert.ok(table, markdown);
  assert.equal(converter.turndown(rendered), markdown);
  return table;
}

test('pasted table without TH cells survives save and reopen', () => {
  const table = roundTrip(
    '<table><tbody><tr><td>Name</td><td>Value</td></tr><tr><td>A</td><td>B</td></tr></tbody></table>',
  );
  assert.equal(table.rows.length, 2);
  assert.equal(table.rows[1].cells[1].textContent, 'B');
});

test('Tiptap paragraphs and column widths do not turn a table into HTML', () => {
  const table = roundTrip(
    '<table><colgroup><col style="width:120px"><col></colgroup><tbody><tr><th><p>Title</p></th><th><p>Value</p></th></tr><tr><td><p><strong>Bold</strong></p><p>Next line</p></td><td><p></p></td></tr></tbody></table>',
  );
  assert.equal(table.rows[1].cells.length, 2);
  assert.equal(table.rows[1].cells[0].querySelector('strong').textContent, 'Bold');
  assert.match(table.rows[1].cells[0].textContent, /Next line/);
});

test('pipes, links, inline code and line breaks stay inside cells', () => {
  const table = roundTrip(
    '<table><tr><th>Header</th></tr><tr><td>A | B<br><a href="https://example.com">Link</a> <code>x|y</code></td></tr></table>',
  );
  assert.equal(table.rows[1].cells.length, 1);
  assert.match(table.rows[1].cells[0].textContent, /A \| B/);
  assert.equal(table.rows[1].cells[0].querySelector('code').textContent, 'x|y');
  assert.equal(
    table.rows[1].cells[0].querySelector('a').getAttribute('href'),
    'https://example.com',
  );
});

test('merged cells become a rectangular Markdown table without losing content', () => {
  const table = roundTrip(
    '<table><tr><td colspan="2">Heading</td></tr><tr><td rowspan="2">Left</td><td>Right</td></tr><tr><td>Bottom</td></tr></table>',
  );
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[2].cells.length, 2);
  assert.equal(table.rows[2].cells[1].textContent.trim(), 'Bottom');
});

test('arbitrary dimensions and empty cells survive serialization', () => {
  const html =
    '<table>' +
    Array.from(
      { length: 7 },
      () => '<tr>' + '<td><p></p></td>'.repeat(5) + '</tr>',
    ).join('') +
    '</table>';
  const table = roundTrip(html);
  assert.equal(table.rows.length, 7);
  assert.equal(table.rows[6].cells.length, 5);
});

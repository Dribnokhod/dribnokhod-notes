// GFM requires a header row, even when pasted HTML only contains TD cells.
// Serialize the table ourselves so colgroups, paragraphs and missing headers
// cannot cause Turndown's GFM plugin to fall back to raw HTML.
export function addTableMarkdownRule(turndown) {
  turndown.addRule('editorTable', {
    filter: 'table',
    replacement: (_, table) => {
      const rows = [];
      Array.from(table.rows).forEach((row, rowIndex) => {
        rows[rowIndex] ||= [];
        let column = 0;
        Array.from(row.cells).forEach((cell) => {
          while (rows[rowIndex][column] !== undefined) column++;
          const text = turndown
            .turndown(cell.innerHTML)
            .trim()
            .replace(/[ \t]*[\r\n]+[ \t\r\n]*/g, ' ')
            .replace(/\|/g, '\\|');
          const colspan = Math.max(1, cell.colSpan || 1);
          const rowspan = Math.max(1, cell.rowSpan || 1);
          for (let y = rowIndex; y < rowIndex + rowspan; y++) {
            rows[y] ||= [];
            for (let x = column; x < column + colspan; x++) {
              rows[y][x] = y === rowIndex && x === column ? text : '';
            }
          }
          column += colspan;
        });
      });
      if (!rows.length) return '';
      const width = Math.max(...rows.map((row) => row.length));
      if (!width) return '';
      const line = (row) =>
        '| ' + Array.from({ length: width }, (_, i) => row[i] || '').join(' | ') + ' |';
      return (
        '\n\n' +
        [
          line(rows[0]),
          line(Array(width).fill('---')),
          ...rows.slice(1).map(line),
        ].join('\n') +
        '\n\n'
      );
    },
  });
}

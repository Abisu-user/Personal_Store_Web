/* eslint-disable @typescript-eslint/no-require-imports */
// Unique names keep fixture CSS Modules isolated, like the production build.
const path = require("node:path");
module.exports = function (source) {
  const globals = [];
  // :global() may contain :has()/ :not(). Preserve the entire balanced selector,
  // rather than accidentally scoping its tail or turning a child into its parent.
  let css = "", cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf(":global(", cursor);
    if (start < 0) { css += source.slice(cursor); break; }
    css += source.slice(cursor, start);
    let depth = 1, end = start + 8;
    for (; end < source.length && depth; end++) {
      if (source[end] === "(") depth++;
      else if (source[end] === ")") depth--;
    }
    if (depth) throw new Error(`Unclosed :global() in ${this.resourcePath}`);
    globals.push(source.slice(start + 8, end - 1));
    css += `GLOBALTOKEN${globals.length - 1}`;
    cursor = end;
  }
  const prefix = path.basename(this.resourcePath).replace(/\W/g, "_");
  const names = [...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1]))];
  const map = Object.fromEntries(names.map(name => [name, `${prefix}_${name}`]));
  css = css.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => `.${map[name]}`).replace(/GLOBALTOKEN(\d+)/g, (_, index) => globals[index]);
  return `const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.appendChild(style);export default ${JSON.stringify(map)};`;
};

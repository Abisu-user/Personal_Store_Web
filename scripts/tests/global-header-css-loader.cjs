/* eslint-disable @typescript-eslint/no-require-imports */
// Unique names keep fixture CSS Modules isolated, like the production build.
const path = require("node:path");
module.exports = function (source) {
  const globals = [];
  let css = source.replace(/:global\(([^)]+)\)/g, (_, value) => { globals.push(value); return `GLOBALTOKEN${globals.length - 1}`; });
  const prefix = path.basename(this.resourcePath).replace(/\W/g, "_");
  const names = [...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(match => match[1]))];
  const map = Object.fromEntries(names.map(name => [name, `${prefix}_${name}`]));
  css = css.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => `.${map[name]}`).replace(/GLOBALTOKEN(\d+)/g, (_, index) => globals[index]);
  return `const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.appendChild(style);export default ${JSON.stringify(map)};`;
};

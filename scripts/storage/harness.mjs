import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const requirePackage = createRequire(new URL("../../package.json", import.meta.url));

/** Execute real TS routes in isolation, replacing only explicitly declared external boundaries.
 * No .env is loaded and no production network/storage is used. */
export function loadApp(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(path) {
    const filename = [path, `${path}.ts`, `${path}.tsx`].find(existsSync);
    if (!filename) throw new Error(`Missing test module: ${path}`);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    function require(specifier) {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier === "server-only") return {};
      if (specifier.startsWith("@/")) return load(resolve(root, "src", specifier.slice(2)));
      if (specifier.startsWith(".")) return load(resolve(dirname(filename), specifier));
      return requirePackage(specifier);
    }
    const context = { process: { env: { SUPABASE_SECRET_KEY: "storage-regression-test-only-not-a-real-key" } }, ...globals };
    new Function("require", "module", "exports", ...Object.keys(context), code)(require, loadedModule, loadedModule.exports, ...Object.values(context));
    return loadedModule.exports;
  }
  return (path) => load(resolve(root, path));
}

export function queryStub(result, calls = []) {
  const query = {};
  for (const name of ["select", "eq", "is", "not", "insert", "update", "delete", "upsert", "in"]) {
    query[name] = (...args) => { calls.push([name, ...args]); return query; };
  }
  query.maybeSingle = query.single = async () => result;
  query.then = (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected);
  return query;
}

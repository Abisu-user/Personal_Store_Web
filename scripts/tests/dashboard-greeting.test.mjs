import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(path.resolve("src/lib/dashboard/greeting.ts"), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports });

const at = (hour, minute = 0) => new Date(2026, 8, 12, hour, minute, 0, 0);
test("greeting follows every local-time boundary", () => {
  assert.equal(exports.getDashboardGreeting(at(4, 59)), "夜深了");
  assert.equal(exports.getDashboardGreeting(at(5)), "早安");
  assert.equal(exports.getDashboardGreeting(at(11)), "午安");
  assert.equal(exports.getDashboardGreeting(at(14)), "下午好");
  assert.equal(exports.getDashboardGreeting(at(18)), "晚安");
  assert.equal(exports.getDashboardGreeting(at(23)), "夜深了");
});
test("one-shot delay always targets the next boundary", () => {
  assert.equal(exports.millisecondsUntilNextGreetingBoundary(at(10, 59)), 60_050);
  assert.equal(exports.millisecondsUntilNextGreetingBoundary(at(22, 59)), 60_050);
  assert.equal(exports.millisecondsUntilNextGreetingBoundary(at(23)), 6 * 60 * 60 * 1000 + 50);
});

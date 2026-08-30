#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { runSystemExamplesImport } from "./import-system-examples.mjs";

for (const filename of [".env.local", ".env"]) {
  const fullPath = path.join(process.cwd(), filename);
  if (!existsSync(fullPath)) continue;
  for (const line of readFileSync(fullPath, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/u);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/u, "$2");
  }
}
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("缺少 Supabase 伺服器端金鑰；請在受信任的本機或 CI 執行。");
const language = (process.argv.find((value) => value.startsWith("--language="))?.split("=")[1] ?? "all").toLowerCase();
const dryRun = process.argv.includes("--dry-run");
runSystemExamplesImport({ admin: createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }), language, dryRun })
  .catch((error) => { console.error("[vocabulary-examples] failed", error); process.exitCode = 1; });

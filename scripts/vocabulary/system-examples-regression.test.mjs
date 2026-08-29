import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migration = new URL("../../supabase/migrations/20260830161000_add_system_vocabulary_examples.sql", import.meta.url);

test("reviewed Japanese examples preserve the intended senses", async () => {
  const sql = await readFile(migration, "utf8");
  for (const expected of [
    "先生は学生にチャンスを与えた。",
    "事故に遭った",
    "例を三つ挙げてください。",
    "店の中で暴れている。",
    "会場は人であふれていた。",
    "そんなの当たり前だ。",
    "相変わらず元気です。",
  ]) assert.match(sql, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(sql, /友達に遭う|会う友達/);
  assert.match(sql, /'manual', 'pv-reviewed-v1', true, 'system'/);
});

test("examples remain sense-aware and do not use one single example column", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /dictionary_entry_id uuid/);
  assert.match(sql, /sense_id text/);
  assert.match(sql, /example_kind text/);
  assert.match(sql, /vocabulary_examples_system_unique_idx/);
});

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");
async function sourceFiles(path) {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory()
    ? sourceFiles(`${path}/${entry.name}`)
    : /\.(ts|tsx)$/.test(entry.name) ? [`${path}/${entry.name}`] : []))).flat();
}

test("only the Supabase adapter performs SDK Storage operations anywhere in src", async () => {
  const violations = [];
  for (const file of await sourceFiles("src")) {
    if (file === "src/lib/storage/supabase-provider.ts") continue;
    const ast = ts.createSourceFile(file, await source(file), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const method = node.expression;
        if (ts.isPropertyAccessExpression(method.expression) && method.expression.name.text === "storage" && method.name.text !== "persist") violations.push(file);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.deepEqual(violations, []);
});

test("only composition roots choose providers; browser path has no server credentials or admin imports", async () => {
  const server = await source("src/lib/storage/server.ts");
  const browser = await source("src/lib/storage/client.ts");
  assert.match(server, /import "server-only"/);
  assert.match(server, /new SupabaseStorageProvider\(client\.storage\)/);
  assert.match(browser, /new SupabaseStorageProvider\(createClient\(\)\.storage\)/);
  for (const path of ["client.ts", "manager.ts", "provider.ts", "supabase-provider.ts"]) {
    assert.doesNotMatch(await source(`src/lib/storage/${path}`), /SUPABASE_SECRET_KEY|SERVICE_ROLE|lib\/supabase\/admin|lib\/storage\/server|process\.env/);
  }
  assert.doesNotMatch(await source("src/lib/supabase/client.ts"), /SUPABASE_SECRET_KEY|SERVICE_ROLE/);
  for (const path of ["provider.ts", "manager.ts"]) assert.doesNotMatch(await source(`src/lib/storage/${path}`), /from ["']@supabase/);
});

test("all cover features reuse the existing shared upload helper", async () => {
  for (const path of ["anime/anime-workspace.tsx", "bookmarks/bookmarks-workspace.tsx", "notes/notes-workspace.tsx", "code/code-workspace.tsx"]) {
    const content = await source(`src/components/${path}`);
    assert.match(content, /uploadCover/);
    assert.match(content, /content\/cover-image-field/);
  }
});

test("file/photo UI still sends one signed binary upload before one finalize request", async () => {
  for (const kind of ["files", "photos"]) {
    const content = await source(`src/components/${kind}/${kind}-workspace.tsx`);
    assert.match(content, /createBrowserStorageManager\(\)/);
    assert.match(content, /uploadToSignedUrl\("vault-files", ticket\.storagePath, ticket\.token, file/);
    assert.equal(content.match(/\.uploadToSignedUrl\(/g).length, 1);
    const ast = ts.createSourceFile("workspace.tsx", content, ts.ScriptTarget.Latest, true);
    let uploadFunction = "";
    function findUpload(node) {
      if (ts.isFunctionDeclaration(node) && node.name?.text === "upload") uploadFunction = node.getText(ast);
      ts.forEachChild(node, findUpload);
    }
    findUpload(ast);
    assert.ok(uploadFunction.indexOf(".uploadToSignedUrl(") >= 0);
    assert.ok(uploadFunction.indexOf(".uploadToSignedUrl(") < uploadFunction.indexOf(`fetch("/api/${kind}",`));
    assert.match(content, /if \(uploadError\) throw uploadError/);
  }
});

test("Vault currently stores encrypted text in DB and has no attachment upload path to migrate", async () => {
  const component = await source("src/components/vault/vault-workspace.tsx");
  assert.match(component, /crypto\.subtle\.encrypt\(/);
  assert.match(component, /crypto\.subtle\.decrypt\(/);
  assert.match(component, /name: "AES-GCM"/);
  assert.match(component, /JSON\.stringify\(\{ id, ciphertext:/);
  assert.doesNotMatch(component, /StorageManager|uploadToSignedUrl|type="file"/);
});

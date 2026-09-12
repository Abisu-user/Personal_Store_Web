const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "../..");
const avifBase64 = "AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADrbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAAAAAAAOcGl0bQAAAAAAAQAAAB5pbG9jAAAAAEQAAAEAAQAAAAEAAAETAAAALQAAAChpaW5mAAAAAAABAAAAGmluZmUCAAAAAAEAAGF2MDFDb2xvcgAAAABqaXBycAAAAEtpcGNvAAAAFGlzcGUAAAAAAAAAIAAAADAAAAAQcGl4aQAAAAADCAgIAAAADGF2MUOBAAwAAAAAE2NvbHJuY2x4AAEADQAGgAAAABdpcG1hAAAAAAAAAAEAAQQBAoMEAAAANW1kYXQSAAoJGBF/e0QENBoQMh4Ux4eGZQIIIJ5QAAAAyRtVJrqwiu5f/fnNe988qoA=";

function compile(relativePath) {
  return ts.transpileModule(fs.readFileSync(path.join(root, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

(async () => {
  const executablePath = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((candidate) => candidate && fs.existsSync(candidate));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: `
      (() => {
        const load = (source, require) => {
          const module = { exports: {} };
          new Function("require", "module", "exports", source)(require, module, module.exports);
          return module.exports;
        };
        const format = load(${JSON.stringify(compile("src/lib/appearance/background-image-format.ts"))}, () => ({}));
        const processing = load(${JSON.stringify(compile("src/lib/appearance/background-image-processing.ts"))}, (id) => {
          if (id === "@/lib/appearance/background-image-format") return format;
          throw new Error("Unexpected module: " + id);
        });
        window.backgroundImageTest = { format, processing };
      })();
    ` });

    const results = await page.evaluate(async ({ avifBase64 }) => {
      const { prepareBackgroundImage } = window.backgroundImageTest.processing;
      const canvasFile = async (name, type) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 1536;
        const context = canvas.getContext("2d");
        context.fillStyle = "#5178a0";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
        return new File([blob], name, { type });
      };
      const fromBase64 = (name, type, value) => {
        const binary = atob(value);
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
        return new File([bytes], name, { type });
      };
      const cases = [
        await canvasFile("photo.jpg", "image/jpeg"),
        await canvasFile("20210201_190717.jpeg", "image/jpeg"),
        await canvasFile("photo.png", "image/png"),
        await canvasFile("photo.webp", "image/webp"),
        fromBase64("photo.avif", "image/avif", avifBase64),
      ];
      const values = [];
      for (const file of cases) {
        const prepared = await prepareBackgroundImage(file);
        values.push({ name: file.name, input: prepared.inputMimeType, output: prepared.outputMimeType, width: prepared.width, height: prepared.height, size: prepared.blob.size });
      }

      const originalCreateImageBitmap = window.createImageBitmap;
      window.createImageBitmap = undefined;
      const fallback = await prepareBackgroundImage(await canvasFile("20210201_190717.jpeg", "image/jpeg"));
      window.createImageBitmap = originalCreateImageBitmap;
      return { values, fallback: { input: fallback.inputMimeType, output: fallback.outputMimeType, width: fallback.width, height: fallback.height } };
    }, { avifBase64 });

    assert.equal(results.values.length, 5);
    for (const value of results.values) {
      assert.ok(value.size > 0, `${value.name} should produce a non-empty blob`);
      assert.ok(value.width > 0 && value.height > 0, `${value.name} should decode dimensions`);
    }
    const jpeg = results.values.find((value) => value.name === "20210201_190717.jpeg");
    assert.deepEqual(jpeg, { name: "20210201_190717.jpeg", input: "image/jpeg", output: "image/jpeg", width: 768, height: 1152, size: jpeg.size });
    assert.deepEqual(results.fallback, { input: "image/jpeg", output: "image/jpeg", width: 768, height: 1152 });
    console.log(JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

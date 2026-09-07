/* eslint-disable @typescript-eslint/no-require-imports */
// Isolated component integration: fake API/Storage, no personal data or live service.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { chromium } = require("playwright");
const webpack = require("next/dist/compiled/webpack/webpack").webpack;
const root = path.resolve(__dirname, "../..");
const output = fs.mkdtempSync(path.join(os.tmpdir(), "vault-create-modal-"));
async function main() {
  await new Promise((resolve,reject) => webpack({
    mode:"development", devtool:false, entry:path.join(__dirname,"create-modal-fixture.tsx"), output:{path:output,filename:"test.js"},
    resolve:{extensions:[".tsx",".ts",".js"],alias:{"@/lib/supabase/client$":path.join(__dirname,"storage-stub.ts"),"@":path.join(root,"src"),"next/navigation$":path.join(__dirname,"navigation-stub.tsx"),"next/link$":path.join(__dirname,"navigation-stub.tsx")}},
    module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(__dirname,"ts-loader.cjs")}]},
  },(err,stats)=>err||stats.hasErrors()?reject(err||new Error(stats.toString({all:false,errors:true}))):resolve()));
  const server=http.createServer((req,res)=>{
    const filename=path.basename(req.url.split("?")[0]);
    if(filename.endsWith(".js")&&fs.existsSync(path.join(output,filename))){res.setHeader("Content-Type","text/javascript; charset=utf-8");res.end(fs.readFileSync(path.join(output,filename)));}
    else if(req.url==="/style.css"){res.setHeader("Content-Type","text/css; charset=utf-8");res.end(fs.readFileSync(path.join(root,"src/app/globals.css")));}
    else res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/test.js"></script></body></html>');
  });
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({headless:true,channel:process.env.TEST_BROWSER_CHANNEL||"msedge"}).catch(e=>{server.close();throw e;});
  try {
    const page=await browser.newPage();
    await page.addInitScript(() => { window.testNavigations = []; window.addEventListener("test:navigate", e => window.testNavigations.push(e.detail)); });
    const errors=[];page.on("pageerror",e=>{errors.push(e.message);console.error(e.message);});
    let fail=true;
    const empty={folders:[],categories:[],tags:[],notes:[],snippets:[],files:[],photos:[],bookmarks:[],cards:[],decks:[],reviewLogs:[],settings:{dailyNewGoal:5,dailyReviewGoal:20,flashcardPreferences:{}}};
    await page.route("**/api/**",route=>{
      const req=route.request(), url=new URL(req.url());
      if(url.pathname.endsWith("/preview"))return route.fulfill({json:{title:"測試",hostname:"example.com"}});
      if(req.method()==="GET")return route.fulfill({json:empty});
      if(fail)return route.fulfill({status:500,json:{error:"模擬失敗，請重試"}});
      return route.fulfill({json:url.pathname.endsWith("/upload-url")?{storagePath:"test",token:"test",ticket:"test"}:{ok:true}});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const original=page.url();
    for(const width of [1440,768,390]){
      await page.setViewportSize({width,height:900});
      for(const [kind,title]of [["bookmark","新增網站收藏"],["note","新增筆記"],["code","新增程式碼"],["file","新增檔案"],["photo","新增照片"],["vocabulary","新增單字"]]){
        await page.locator("#original-page").getByRole("button",{name:title,exact:true}).click();
        const dialog=page.getByRole("dialog",{name:title,exact:true});
        const submit=dialog.locator(".create-item-footer button").last();
        await submit.waitFor();
        assert.equal(page.url(),original);
        assert.ok(await page.locator("#original-page").isVisible());
        assert.equal(await dialog.locator(".create-item-footer button").first().textContent(),"取消");
        if(kind==="bookmark"){await dialog.locator('input[name=url]').fill("https://example.com/test");await dialog.locator('input[name=title]').fill("測試");}
        if(kind==="note"||kind==="code"){await dialog.locator('input[name=title]').fill("測試");await dialog.locator(`textarea[name=${kind==="note"?"content":"sourceCode"}]`).fill("test content");}
        if(kind==="file"||kind==="photo"){await dialog.locator(`input[name=${kind==="file"?"file":"photo"}]`).setInputFiles({name:kind==="file"?"test.txt":"test.png",mimeType:kind==="file"?"text/plain":"image/png",buffer:kind==="file"?Buffer.from("test"):Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC3sAAAAASUVORK5CYII=","base64")});}
        if(kind==="vocabulary"){await dialog.getByLabel("單字",{exact:true}).fill("test");await dialog.getByLabel("主要意思",{exact:true}).fill("測試");}
        fail=true; await submit.click();
        await dialog.getByText("模擬失敗，請重試",{exact:true}).waitFor();
        assert.equal(page.url(),original);
        await dialog.locator(".create-item-footer button").first().click();
        await page.getByRole("alertdialog").waitFor();
        await page.getByRole("alertdialog").getByRole("button",{name:"取消",exact:true}).click();
        assert.ok(await dialog.isVisible());
        const bounds=await submit.evaluate(el=>{const r=el.getBoundingClientRect(),d=el.closest(".modal-dialog").getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,height:r.height,width:r.width,container:d.width};});
        assert.ok(bounds.x>=0&&bounds.right<=width&&bounds.y>=0&&bounds.bottom<=900,JSON.stringify(bounds));
        assert.ok(bounds.height>=38&&bounds.width<bounds.container/2,JSON.stringify(bounds));
        await page.screenshot({path:path.join(output,`${kind}-${width}.png`)});
        const before=Number(await page.locator("#refreshes").textContent());
        fail=false;await submit.click();await dialog.waitFor({state:"detached"});
        assert.equal(Number(await page.locator("#refreshes").textContent()),before+1);
        assert.equal(page.url(),original);
        console.log("PASS",kind,width,"cancel confirmation / failed save retained / success closes and refreshes");
      }
    }
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(() => window.testNavigations),[], "no push/replace during create, cancel or save");
    console.log("Screenshots:",output);
  } finally {await browser.close();server.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

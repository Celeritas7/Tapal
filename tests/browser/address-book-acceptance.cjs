// Run with Playwright available. CHROMIUM_PATH optionally selects an installed browser.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try {
    const page = await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true});
    page.setDefaultTimeout(5000);
    const recipients = [];
    await page.route("**/*", async route => {
      const req = route.request(), url = new URL(req.url());
      if(url.origin === "https://tapal.test") return route.fulfill({path:path.join(root,url.pathname === "/" ? "index.html" : url.pathname)});
      if(!url.pathname.startsWith("/rest/v1/")) return route.abort();
      const table = url.pathname.slice("/rest/v1/".length);
      if(table === "rpc/tapal_my_role") return route.fulfill({json:"operator"});
      if(["tapal_senders","tapal_shipments","tapal_settings"].includes(table)) return route.fulfill({json:[]});
      if(table !== "tapal_addresses") return route.abort();
      if(req.method() === "GET") return route.fulfill({json:recipients});
      if(req.method() === "POST"){
        const saved = [req.postDataJSON()].flat().map(row => {
          const record = {...row,id:String(recipients.length+1),archived:false};
          recipients.push(record);
          return record;
        });
        return route.fulfill({json:saved});
      }
      if(req.method() === "PATCH"){
        const row = recipients.find(r => "eq."+r.id === url.searchParams.get("id"));
        assert.ok(row);
        Object.assign(row,req.postDataJSON());
        return route.fulfill({json:[row]});
      }
      return route.abort();
    });
    await page.addInitScript(() => localStorage.setItem("tapal-session",JSON.stringify({
      user_id:"sample",email:"sample@example.test",access_token:"fixture",expires_at:Date.now()/1000+3600
    })));
    page.on("dialog",dialog => dialog.accept());
    async function openBook(){
      await page.goto("https://tapal.test");
      await page.locator('[data-tab="book"]').click();
      assert.match(await page.locator("#connTxt").innerText(),/Synced/);
    }
    await openBook();
    await page.locator("#showAdd").click();
    await page.locator("#r_country").selectOption("Japan");
    await page.locator("#r_name").fill("Sample recipient");
    await page.locator("#r_city").fill("上尾市");
    await page.locator("#r_romaji").fill("Ageo-shi");
    await page.locator("#saveAddr").click();
    await page.locator("[data-edit]").waitFor();
    await openBook();
    await page.locator("[data-edit]").click();
    assert.equal(await page.locator("#r_city").inputValue(),"上尾市");
    assert.equal(await page.locator("#r_romaji").inputValue(),"Ageo-shi");
    await page.locator("#cancelAddr").click();
    const downloaded = page.waitForEvent("download");
    await page.locator("#exportAddresses").click();
    const csv = await fs.readFile(await (await downloaded).path(),"utf8");
    assert.ok(csv.includes("Ageo-shi"));
    await page.locator("[data-del]").click();
    await page.locator("[data-edit]").waitFor({state:"detached"});
    async function importCSV(content, expected){
      await page.locator("#importAddresses").setInputFiles({name:"sample.csv",mimeType:"text/csv",buffer:Buffer.from(content)});
      await page.waitForFunction(msg => document.getElementById("bookStatus").textContent === msg,expected);
    }
    await importCSV(csv,"0 imported. 1 duplicates skipped.");
    await importCSV(csv.replace("Sample recipient","Second recipient"),"1 imported. 0 duplicates skipped.");
    await openBook();
    await page.locator("details").filter({has:page.locator("#archivedList")}).locator("summary").click();
    await page.locator("[data-restore]").click();
    await page.locator('[data-edit="1"]').waitFor();
    await openBook();
    assert.equal(await page.locator("[data-edit]").count(),2);
    assert.deepEqual(recipients.map(r=>[r.id,r.city,r.address_romaji,r.archived]),[
      ["1","上尾市","Ageo-shi",false],["2","上尾市","Ageo-shi",false]
    ]);
    console.log("PASS: signed-in recipient save, reload, CSV export/import, archived duplicate and restore using simulated REST.");
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});

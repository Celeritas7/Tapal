// Run with Playwright available and CHROMIUM_PATH pointing to Chrome or Chromium.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tapal-print-"));
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  try {
    const page = await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true});
    page.setDefaultTimeout(5000);
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if(url.origin !== "https://tapal.test") return route.abort();
      const file = path.join(root,url.pathname === "/" ? "index.html" : url.pathname);
      return route.fulfill({path:file});
    });
    await page.addInitScript(() => {
      if(localStorage.getItem("parcel-label-data")) return;
      localStorage.setItem("parcel-label-data",JSON.stringify({
        activeSenderId:"s",senders:[{id:"s",name:"Sample sender",country:"India",city:"Pune"}],
        addresses:[{id:"r",name:"Sample recipient",country:"Japan",city:"上尾市",state:"Saitama-ken",
          addr:"1-2-3",pin:"362-0001",address_romaji:"1-2-3 Ageo-shi"}],shipments:[]
      }));
    });
    await page.goto("https://tapal.test");
    await page.locator("details").filter({has:page.locator("#homeTo")}).locator("summary").click();
    await page.locator("#homeTo input").check();
    await page.locator("#customsOptions summary").click();
    await page.locator("#includeCustoms").check();
    await page.locator('[name="description"]').fill("Sample notebook");
    await page.locator('[name="quantity"]').fill("2");
    await page.locator('[name="price"]').fill("125.50");
    await page.locator("#previewBtn").click();
    const preview = await page.locator("#scalerInner").innerText();
    for(const value of ["上尾市","1-2-3 Ageo-shi","Sample notebook","INR 251.00"]) assert.ok(preview.includes(value),value);
    const pdf = path.join(dir,"parcel.pdf");
    await page.pdf({path:pdf,preferCSSPageSize:true,printBackground:true});
    const printed = execFileSync("pdftotext",["-layout",pdf,"-"],{encoding:"utf8"});
    for(const value of ["1-2-3 Ageo-shi","Sample notebook","INR 251.00"]) assert.ok(printed.includes(value),value);
    await page.locator("#hideBtn").click();
    await page.locator("details").filter({has:page.locator("#costOut")}).locator("summary").click();
    await page.locator("[data-estimate]").first().click();
    assert.equal(await page.locator("#lgService").inputValue(),"Speed Post EMS");
    assert.equal(await page.locator("#lgCurrency").inputValue(),"INR");
    await page.locator("#lgCost").fill("1299");
    await page.locator("#lgCn").fill("TEST12345JP");
    await page.locator("#addLog").click();
    await page.locator("[data-barcode]").waitFor();
    await page.reload();
    await page.locator('[data-tab="history"]').click();
    assert.match(await page.locator("#logBody").innerText(),/INR 1299/);
    await page.locator("[data-barcode]").click();
    assert.equal(await page.locator(".trackingValue").innerText(),"TEST12345JP");
    const barcode = path.join(dir,"barcode.pdf");
    await page.pdf({path:barcode,preferCSSPageSize:true,printBackground:true});
    assert.match(execFileSync("pdftotext",[barcode,"-"],{encoding:"utf8"}),/TEST12345JP/);
    console.log("PASS: mobile customs worksheet, bilingual preview, print PDF, estimate correction, device reload and barcode label.");
  } finally {
    await browser.close();
    await fs.rm(dir,{recursive:true,force:true});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const vm = require("node:vm");
const {webcrypto} = require("node:crypto");

function storage(){
  const values = new Map();
  return {
    setItem(key, value){ values.set(key, value); },
    getItem(key){ return values.get(key) ?? null; },
    removeItem(key){ values.delete(key); }
  };
}

function openApp({sessionStorage = storage(), localStorage = storage(), online = true} = {}){
  const elements = new Map();
  function element(id){
    if(!elements.has(id)) elements.set(id, {
      style:{}, options:[], value:"", checked:false, parentNode:{clientWidth:0},
      replaceChildren(...items){ this.options = items; },
      set innerHTML(markup){ this.markup = markup; this.options = []; },
      add(option){ this.options.push(option); option.remove = () => { this.options = this.options.filter(x => x !== option); }; },
      focus(){},
      addEventListener(name, handler){ this[name] = handler; }
    });
    return elements.get(id);
  }
  const env = vm.createContext({
    crypto:webcrypto, localStorage, sessionStorage, location:{hash:""}, console,
    document:{body:{classList:{add(){},remove(){}}}, getElementById:element, querySelector:element, querySelectorAll:()=>[], addEventListener(){}},
    window:{navigator:{locks:{request:(_, change) => change()}},addEventListener(){},scrollTo(){}},
    Option:class { constructor(text,value){ this.text = text; this.value = value; } }
  });
  const run = code => vm.runInContext(code, env);
  for(const file of ["config.js","countries.js","customs.js","address-book.js","app.js"]) run(readFileSync(join(__dirname,"../js",file),"utf8"));
  run(`online = ${online}; role = "operator"; session = {user_id:"u"};
    addresses = [{id:"a",name:"Test recipient"}];`);
  element("lgTo").value = "a";
  element("lgContents").value = "Books";
  element("lgStatus").value = "booked";
  element("shipmentEntry").open = true;
  return {env, element, run, confirm:() => element("addLog").onclick()};
}

test("lost acknowledgment, double tap and retry create one server row", async () => {
  const app = openApp();
  const rows = new Map(), ids = [];
  app.env.rest = async (path, opts) => {
    if(!opts) return [rows.get(path.match(/id=eq\.([^&]+)/)[1])];
    assert.match(opts.headers.Prefer,/resolution=ignore-duplicates/);
    const row = JSON.parse(opts.body);
    ids.push(row.id);
    if(rows.has(row.id)) return [];
    rows.set(row.id, row);
    throw Error("response lost");
  };
  await Promise.all([app.confirm(),app.confirm()]);
  assert.equal(ids.length,1);
  assert.equal(app.element("lgContents").value,"Books");
  assert.equal(app.element("shipmentEntry").open,true);
  assert.equal(app.element("addLog").textContent,"Retry save");
  await app.confirm();
  assert.deepEqual(ids,[ids[0],ids[0]]);
  assert.equal(rows.size,1);
  assert.equal(app.run("shipments.length"),1);
  assert.equal(app.element("shipmentEntry").open,false);
});

test("same-tab reload recovers an unconfirmed attempt", async () => {
  const sessionStorage = storage();
  const app = openApp({sessionStorage});
  app.env.rest = async () => { throw Error("connection lost"); };
  await app.confirm();
  const retryId = app.run("pendingShipment.row.id");
  const reopened = openApp({sessionStorage});
  reopened.element("lgContents").value = "";
  reopened.run("restorePendingShipment()");
  assert.equal(reopened.element("lgContents").value,"Books");
  reopened.env.rest = async (_,opts) => [JSON.parse(opts.body)];
  await reopened.confirm();
  assert.equal(reopened.run("shipments[0].id"), retryId);
  assert.equal(sessionStorage.getItem("tapal-pending-shipment:u"),null);
});

test("device write failures preserve shipment fields and missing tracking", async () => {
  const localStorage = storage(), write = localStorage.setItem;
  const fail = () => { throw Error("Storage full"); };
  const app = openApp({online:false,localStorage});
  localStorage.setItem = fail;
  await app.confirm();
  assert.equal(app.run("shipments.length"),0);
  assert.match(app.element("status").textContent,/Storage full/);
  assert.equal(app.element("shipmentEntry").open,true);
  assert.equal(app.element("lgContents").value,"Books");
  localStorage.setItem = write;
  await app.confirm();
  assert.equal(app.element("missingCount").textContent,"· 1 missing");
  const id = app.run("shipments[0].id");
  const field = {value:"TRACK123"};
  const event = {target:{dataset:{track:id}, closest:()=>({querySelector:()=>field,querySelectorAll:()=>[]})}};
  localStorage.setItem = fail;
  await app.element("logBody").click(event);
  assert.equal(app.run("shipments[0].consignment_no"),"");
  assert.equal(app.element("missingCount").textContent,"· 1 missing");
  assert.equal(field.value,"TRACK123");
  localStorage.setItem = write;
  await app.element("logBody").click(event);
  assert.equal(app.element("missingCount").textContent,"");
  const saved = JSON.parse(localStorage.getItem("parcel-label-data")).shipments;
  assert.equal(saved.length,1);
  assert.equal(saved[0].consignment_no,"TRACK123");
});

test("reload recognizes a committed confirmation before offering a retry", async () => {
  const sessionStorage = storage();
  const app = openApp({sessionStorage});
  let committed;
  app.env.rest = async (_,opts) => {
    committed = JSON.parse(opts.body);
    throw Error("response lost");
  };
  await app.confirm();
  const reopened = openApp({sessionStorage});
  reopened.env.fixtureRow = committed;
  reopened.run("shipments = [fixtureRow]; restorePendingShipment()");
  assert.equal(reopened.run("pendingShipment"),null);
  assert.equal(reopened.run("shipments.length"),1);
  assert.equal(sessionStorage.getItem("tapal-pending-shipment:u"),null);
});

test("a lost tracking acknowledgment accepts only the same stored number on retry", async () => {
  const app = openApp();
  app.run('shipments = [{id:"s1",status:"booked",consignment_no:null}]; renderLog()');
  let stored = null;
  app.env.rest = async (path,opts) => {
    if(!opts) return [{consignment_no:stored}];
    if(stored) return [];
    stored = JSON.parse(opts.body).consignment_no;
    throw Error("response lost");
  };
  const field = {value:"TRACK1"};
  const e = {target:{dataset:{track:"s1"},closest:()=>({querySelector:()=>field,querySelectorAll:()=>[]})}};
  await app.element("logBody").click(e);
  assert.equal(app.element("missingCount").textContent,"· 1 missing");
  field.value = "DIFFERENT";
  await app.element("logBody").click(e);
  assert.equal(app.element("missingCount").textContent,"· 1 missing");
  field.value = stored;
  await app.element("logBody").click(e);
  assert.equal(app.element("missingCount").textContent,"");
});

async function labelApp(){
  const localStorage = storage();
  localStorage.setItem("parcel-label-data",JSON.stringify({
    senders:[{id:"j",name:"Japan home",country:"Japan"},{id:"i",name:"India home",country:"India"}],
    addresses:[{id:"a",name:"Recipient A"},{id:"b",name:"Recipient B"}]
  }));
  const app = openApp({online:false,localStorage});
  await app.run("loadAll()");
  app.run("boot = () => {}"); // Start with the loaded device data.
  app.run(readFileSync(join(__dirname,"../js/labels.js"),"utf8"));
  app.element("shipmentEntry").open = false;
  app.element("size").value = "two";
  return app;
}

function pick(app, id, checked, own = false){
  app.element("homeTo").onchange({target:{value:id,checked,dataset:{own:String(own)}}});
}

test("new label has zero recipients and changing destination requires a new preview", async () => {
  const app = await labelApp();
  assert.equal(app.run("recipients().length"),0);
  assert.match(app.element("toSummary").textContent,/Choose recipients/);
  pick(app,"a",true);
  app.element("previewBtn").onclick();
  app.element("hideBtn").onclick();
  assert.match(app.element("recordPrepared").textContent,/Recipient A/);
  app.element("recordPrepared").onclick();
  assert.equal(app.element("lgTo").value,"a");
  pick(app,"a",false);
  pick(app,"i",true,true);
  assert.equal(app.element("recordPrepared").style.display,"none");
  assert.equal(app.element("shipmentEntry").open,false);
  assert.equal(app.element("lgTo").value,"");
  app.element("recordPrepared").onclick();
  assert.equal(app.element("shipmentEntry").open,false);
  app.element("previewBtn").onclick();
  app.element("hideBtn").onclick();
  assert.match(app.element("recordPrepared").textContent,/India home/);
  app.element("recordPrepared").onclick();
  assert.equal(app.element("lgTo").value,"sender:i");
  assert.equal(app.element("lgStatus").value,"booked");
  await app.confirm();
  assert.equal(app.element("missingCount").textContent,"· 1 missing");
});

test("bulk selection is explicit and a partial batch names its remaining destination", async () => {
  const app = await labelApp();
  app.element("selAll").onclick();
  app.element("previewBtn").onclick();
  assert.match(app.element("recordPrepared").textContent,/2 recipients/);
  app.element("recordPrepared").onclick();
  assert.equal(app.element("lgTo").value,"");
  app.element("lgTo").value = "b";
  await app.confirm();
  assert.match(app.element("recordPrepared").textContent,/Recipient A/);
  app.element("previewBtn").onclick();
  app.element("recordPrepared").onclick();
  assert.equal(app.element("lgTo").value,"a");
  app.element("selNone").onclick();
  assert.equal(app.element("recordPrepared").style.display,"none");
});

test("History defaults to booked and preserves an explicit packed choice for that entry", async () => {
  const doc = readFileSync(join(__dirname,"../index.html"),"utf8");
  assert.match(doc,/<select id="lgStatus"><option selected>booked<\/option>/);
  const app = await labelApp();
  app.element("lgTo").value = "a";
  app.element("lgStatus").value = "packed";
  await app.confirm();
  assert.equal(app.run("shipments[0].status"),"packed");
  assert.equal(app.element("missingCount").textContent,"");
  assert.equal(app.element("lgStatus").value,"booked");
  app.element("lgTo").value = "b";
  await app.confirm();
  assert.equal(app.run("shipments[0].status"),"booked");
  assert.equal(app.element("missingCount").textContent,"· 1 missing");
});

test("changing the sender or contents also clears a print-prefilled destination", async () => {
  const app = await labelApp();
  app.env.setTimeout = () => {};
  pick(app,"b",true);
  const print = app.element("printBtn");
  print.onclick();
  assert.equal(app.element("lgTo").value,"b");
  app.element("homeFrom").onchange({target:{value:"i"}});
  assert.equal(app.element("recordPrepared").style.display,"none");
  assert.equal(app.element("lgTo").value,"");
  print.onclick();
  app.element("contents").value = "New contents";
  app.element("contents").input();
  assert.equal(app.element("recordPrepared").style.display,"none");
  assert.equal(app.element("lgTo").value,"");
});

test("booking date uses the local calendar and refreshes when the next form opens", async () => {
  const app = await labelApp();
  app.run(`Date = class extends Date {
    constructor(){ super(2026, 0, 1, 7); }
  }`);
  app.element("shipmentEntry").open = true;
  app.element("shipmentEntry").toggle();
  assert.equal(app.element("lgDate").value,"2026-01-01");
  app.element("cancelShipment").onclick();
  app.run(`Date = class extends globalThis.Date {
    constructor(){ super(); this.setDate(2); }
  }`);
  pick(app,"a",true);
  app.element("previewBtn").onclick();
  app.element("recordPrepared").onclick();
  assert.equal(app.element("lgDate").value,"2026-01-02");
});

test("Japan and India postage keeps its service, currency and amount after device reload", async () => {
  const app = await labelApp();
  const history = app.element("shipmentEntry");
  history.open = true;
  history.toggle();
  assert.equal(app.element("lgService").value,"Japan Post");
  assert.ok(app.element("lgService").options.some(o => o.value === "Yamato Transport"));
  assert.equal(app.element("lgCurrency").value,"JPY");
  app.element("lgTo").value = "a";
  app.element("lgService").value = "Yamato Transport";
  app.element("lgCost").value = "1250";
  await app.confirm();

  app.element("homeFrom").onchange({target:{value:"i"}});
  pick(app,"b",true);
  app.element("previewBtn").onclick();
  app.element("recordPrepared").onclick();
  assert.equal(app.element("lgService").value,"Speed Post");
  assert.equal(app.element("lgCurrency").value,"INR");
  app.element("lgCost").value = "75.50";
  await app.confirm();
  await app.run("loadAll()");
  const rows = JSON.parse(app.run("JSON.stringify(shipments)"));
  assert.deepEqual(rows.map(s => [s.service,s.cost_currency,s.cost]), [
    ["Speed Post","INR",75.5],["Yamato Transport","JPY",1250]
  ]);
  assert.match(app.element("logBody").markup,/JPY 1250/);
  assert.match(app.element("logBody").markup,/INR 75.5/);
});

test("legacy costs remain readable and zero differs from an omitted cost", async () => {
  const app = await labelApp();
  app.run('shipments = [{id:"old",cost:500},{id:"blank",cost:null}]; renderLog()');
  assert.match(app.element("logBody").markup,/500 \(currency unrecorded\)/);
  assert.equal(app.element("logBody").markup.match(/Cost ·/g).length,1);
  app.element("shipmentEntry").open = true;
  app.element("shipmentEntry").toggle();
  app.element("lgTo").value = "a";
  app.element("lgCost").value = "0";
  app.element("lgCurrency").value = "";
  await app.confirm();
  assert.equal(app.run("shipments.length"),2);
  app.element("lgCurrency").value = "INR";
  await app.confirm();
  assert.match(app.element("logBody").markup,/INR 0/);
});

test("retry retains the submitted currency, date and carrier even on a different sender", async () => {
  const sessionStorage = storage(), first = openApp({sessionStorage});
  first.element("lgCurrency").value = "JPY";
  first.element("lgCost").value = "900";
  first.element("lgService").value = "Yamato Transport";
  first.element("lgDate").value = "2026-01-01";
  let submitted;
  first.env.rest = async (_,opts) => { submitted = JSON.parse(opts.body); throw Error("offline"); };
  await first.confirm();

  const retry = openApp({sessionStorage});
  retry.run('senders = [{id:"i",country:"India"}]; activeSenderId = "i"; restorePendingShipment()');
  assert.equal(retry.element("lgDate").value,"2026-01-01");
  assert.equal(retry.element("lgCurrency").value,"JPY");
  assert.equal(retry.element("lgService").value,"Yamato Transport");
  assert.ok(retry.element("lgService").options.some(o => o.value === "Yamato Transport"));
  retry.env.rest = async (_,opts) => {
    assert.deepEqual(JSON.parse(opts.body),submitted);
    return [submitted];
  };
  await retry.confirm();
  assert.equal(retry.run("shipments[0].cost_currency"),"JPY");
});

test("preview counter follows the visible sheet and reaches the last slip on a tall phone", async () => {
  const app = await labelApp();
  const scroller = app.element("sheets");
  Object.assign(scroller, {scrollTop:0, clientHeight:800, scrollHeight:1600});
  app.element("previewHeading").getBoundingClientRect = () => ({bottom:42});
  app.element(".bar").getBoundingClientRect = () => ({top:739});
  app.element("scalerInner").children = [528, 1021, 1514].map(bottom => ({
    getBoundingClientRect:() => ({bottom:bottom - scroller.scrollTop})
  }));
  for(const [scrollTop, expected] of [[0,1], [80,1], [250,2], [799.5,3], [250,2], [0,1]]){
    scroller.scrollTop = scrollTop;
    scroller.scroll();
    assert.equal(app.element("pageNumber").textContent, expected + " of 3");
  }
  // Two sheets can nearly fit together in a very tall viewport.
  scroller.clientHeight = 1000;
  scroller.scrollHeight = 1108;
  app.element("scalerInner").children.pop();
  scroller.scrollTop = 108;
  scroller.scroll();
  assert.equal(app.element("pageNumber").textContent, "2 of 2");
});

test("stale tabs preserve each other's shipments and address edits", async () => {
  const localStorage = storage();
  const a = openApp({online:false,localStorage}), b = openApp({online:false,localStorage});
  await a.confirm();
  await b.run('saveDeviceAddress("addresses", {id:"second",name:"New address"}, false)');
  await b.confirm();
  const saved = JSON.parse(localStorage.getItem("parcel-label-data"));
  assert.equal(new Set(saved.shipments.map(row => row.id)).size,2);
  assert.equal(saved.addresses[0].id,"second");
});

test("a failed device address write preserves the form and retries only once", async () => {
  const localStorage = storage(), write = localStorage.setItem;
  const app = openApp({online:false,localStorage});
  app.run('readForm = () => ({name:"Retry recipient",country:"India",pin:"400001"}); closeAddrModal = () => {};');
  localStorage.setItem = () => { throw Error("Storage full"); };
  await app.element("saveAddr").onclick();
  assert.match(app.element("rNote").textContent,/Storage full/);
  assert.equal(app.run('addresses.some(a => a.name === "Retry recipient")'),false);
  localStorage.setItem = write;
  await Promise.all([app.element("saveAddr").onclick(),app.element("saveAddr").onclick()]);
  assert.equal(JSON.parse(localStorage.getItem("parcel-label-data")).addresses.length,1);
});

test("reopening a partial prepared batch restores only outstanding destinations", async () => {
  const first = await labelApp();
  first.element("selAll").onclick();
  first.element("contents").value = "Books";
  first.element("previewBtn").onclick();
  first.element("recordPrepared").onclick();
  first.element("lgTo").value = "a";
  await first.confirm();
  const reopen = openApp({online:false,localStorage:first.env.localStorage});
  await reopen.run("loadAll()");
  assert.match(reopen.element("recordPrepared").textContent,/Recipient B/);
  reopen.element("recordPrepared").onclick();
  assert.equal(reopen.element("lgTo").value,"b");
  assert.equal(reopen.element("lgContents").value,"Books");
  reopen.element("lgCn").value = "CANCELED";
  reopen.element("lgUntracked").checked = true;
  reopen.element("cancelShipment").onclick();
  for(const id of ["lgTo","lgCn","lgContents","lgCost"]) assert.equal(reopen.element(id).value,"");
  assert.equal(reopen.element("lgUntracked").checked,false);
  assert.equal(reopen.element("lgCn").disabled,false);
  const other = openApp({online:false,localStorage:first.env.localStorage});
  other.run('session = {user_id:"another"}');
  await other.run("loadAll()");
  assert.equal(other.run("preparedParcels.length"),0);
});

test("booking a packed cloud row recovers after a lost acknowledgment", async () => {
  const app = openApp();
  app.run('shipments = [{id:"p",status:"packed",consignment_no:""}]');
  const row = {id:"p",status:"packed",consignment_no:""};
  const actions = [];
  app.env.rest = async (path, opts) => {
    if(!opts) return [row];
    actions.push(opts.method);
    assert.match(path,/status=eq.packed/);
    if(row.status !== "packed") return [];
    Object.assign(row,JSON.parse(opts.body));
    throw Error("Response lost");
  };
  const event = {target:{dataset:{book:"p"}}};
  await app.element("logBody").click(event);
  await app.element("logBody").click(event);
  assert.deepEqual(actions,["PATCH","PATCH"]);
  assert.equal(app.run("shipments.length"),1);
  assert.equal(app.run("shipments[0].status"),"booked");
  assert.equal(app.element("missingCount").textContent,"· 1 missing");
});

test("Retry restores online History atomically and keeps device parcels after a failed retry", async () => {
  const data = storage();
  data.setItem("parcel-label-data",JSON.stringify({shipments:[{id:"local",recipient:"Device parcel"}]}));
  const app = openApp({online:false,localStorage:data});
  const original = data.getItem("parcel-label-data");
  app.env.document.querySelector = selector => selector.includes(".modal.open") ? null : app.element(selector);
  app.run("ensureSession = async () => session");
  let fail = "settings", probes = 0;
  app.env.rest = async path => {
    if(path.startsWith("tapal_settings")){
      probes++;
      if(fail === "settings") throw Error("offline");
    }
    if(path.startsWith("rpc/")) return "operator";
    if(path.startsWith("tapal_shipments")){
      if(fail === "history") throw Error("busy");
      return [{id:"cloud",recipient:"Cloud parcel"}];
    }
    return [];
  };
  app.element("shipmentEntry").open = false;
  await app.run("boot()");
  assert.equal(app.element("retryLoad").style.display,"");
  assert.equal(app.run("shipments[0].id"),"local");
  fail = "history";
  await app.element("retryLoad").onclick();
  assert.equal(app.run("online"),false);
  assert.equal(app.run("shipments[0].id"),"local");
  fail = "";
  await Promise.all([app.element("retryLoad").onclick(),app.element("retryLoad").onclick()]);
  assert.equal(probes,3);
  assert.equal(app.element("retryLoad").style.display,"none");
  assert.equal(app.run("online"),true);
  assert.equal(app.run("shipments[0].id"),"cloud");
  assert.match(app.element("deviceHistoryRows").markup,/Device parcel/);
  assert.equal(data.getItem("parcel-label-data"),original);
});

test("customs worksheets follow the sender's postal service and clear when the parcel changes", () => {
  const app = openApp();
  app.run('updateCustoms({id:"in",country:"India"}, [{id:"jp",name:"Recipient",country:"Japan"}])');
  assert.equal(app.element("customsCurrency").value,"INR");
  assert.match(app.element("customsService").href,/indiapost/);
  app.element("includeCustoms").checked = true;
  const input = value => ({value, valueAsNumber:Number(value), validity:{valid:true}});
  app.element("customsItems").children = [{querySelectorAll:()=>[input("Cotton & silk"),input("3"),input("11.75")]}];
  const sheet = app.run('customsSheets({id:"in",country:"India"},{id:"jp",country:"Japan"})');
  assert.match(sheet,/INR 35.25/);
  assert.match(sheet,/Cotton &amp; silk/);
  app.run('updateCustoms({id:"in",country:"India"}, [{id:"in2",country:"India"}])');
  assert.equal(app.element("customsOptions").hidden,true);
  assert.equal(app.element("includeCustoms").checked,false);
  assert.equal(app.run("customsSheets({}, {})"),"");
});

test("History offers a barcode only for an encodable saved tracking number", async () => {
  const app = await labelApp();
  app.run('shipments = ["001a/JP", "", UNTRACKED, "日本", "x".repeat(49)].map((consignment_no,i) => ({id:String(i),status:"booked",consignment_no})); renderLog()');
  assert.deepEqual(app.element("logBody").markup.match(/data-barcode="[^"]*"/g),['data-barcode="0"']);
  // Start B (104), 'A' (33), checksum (34), stop (106).
  assert.equal(app.run('consignmentBars("A")'),"211214"+"111323"+"131123"+"2331112");
});

test("Japanese address labels preserve both scripts and allow clearing romaji", async () => {
  const app = await labelApp();
  const lines = app.run(`addrLines({country:"Japan", state:"Saitama-ken", city:"上尾市",
    pin:"362-0001", address_romaji:"Ageo-shi, Saitama-ken"}, {country:true})`);
  assert.deepEqual(Array.from(lines), ["〒 362-0001", "埼玉県, 上尾市", "Ageo-shi, Saitama-ken", "JAPAN"]);
  assert.equal(app.run('toRec({country:"Japan", romaji:""}, {address_romaji:"Ageo"}).address_romaji'), null);
  assert.equal(app.run('Object.hasOwn(toRec({country:"India"}), "address_romaji")'), false);
});

test("CSV round trips multiline bilingual records and skips duplicates", async () => {
  const app = await labelApp();
  app.run(`const sourceRow = {name:'A, "B"',phone:'+81 123',addr:'上尾市\\nRoom 02',country:'Japan',pin:'362-0001',address_romaji:'Ageo'};
    const csv = [csvFields,recipientCells(sourceRow)].map(row => row.map(encodeCell).join(",")).join("\\r\\n");
    const imported = parseRecipientCSV(csv);`);
  assert.equal(app.run("imported[0].line"), "上尾市\nRoom 02");
  assert.equal(app.run("imported[0].phone"), "+81 123");
  assert.equal(app.run("newRecipients([sourceRow],imported).length"), 0);
  assert.throws(() => app.run('parseRecipientCSV(csv + String.fromCharCode(34))'));
});

test("archived device recipients survive reload and restore under the same ID", async () => {
  const app = await labelApp();
  await app.run('changeArchive("a",true)');
  await app.run("loadAll()");
  assert.equal(app.run('addresses.some(a => a.id === "a")'), false);
  assert.equal(app.run('archivedRecipients[0].id'), "a");
  await app.run('changeArchive("a",false)');
  await app.run("loadAll()");
  assert.equal(app.run('addresses.filter(a => a.id === "a").length'), 1);
  assert.equal(app.run('archivedRecipients.length'), 0);
});

test("estimate selection opens the chosen recipient's editable INR shipment", async () => {
  const app = await labelApp();
  app.run('closeShipmentEntry(); activeSenderId = "i"; ui.a = {sel:true}; sui.j = {sel:true}; renderCosts()');
  const click = index => app.element("costOut").click({target:{dataset:{estimate:String(index)}}});
  const ems = app.run('estimateOptions.findIndex(x => x.service === "Speed Post EMS" && x.key === "sender:j")');
  assert.ok(ems >= 0);
  click(ems);
  assert.equal(app.element("lgTo").value,"sender:j");
  assert.equal(app.element("lgService").value,"Speed Post EMS");
  assert.equal(app.element("lgCurrency").value,"INR");
  assert.equal(app.element("lgCost").value,"1310");
  app.element("lgCost").value = "1299";
  click(0);
  assert.equal(app.element("lgCost").value,"1299");
  await app.element("addLog").onclick();
  assert.equal(app.run("shipments[0].cost"),1299);
  assert.equal(app.run("shipments[0].service"),"Speed Post EMS");
});

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
      style:{}, options:[], value:"", checked:false,
      add(option){ this.options.push(option); },
      focus(){},
      addEventListener(name, handler){ this[name] = handler; }
    });
    return elements.get(id);
  }
  const env = vm.createContext({
    crypto:webcrypto, localStorage, sessionStorage, location:{hash:""}, console,
    document:{getElementById:element, querySelector:element, querySelectorAll:()=>[], addEventListener(){}},
    window:{addEventListener(){}},
    Option:class { constructor(text,value){ this.text = text; this.value = value; } }
  });
  const run = code => vm.runInContext(code, env);
  for(const file of ["config.js","app.js"]) run(readFileSync(join(__dirname,"../js",file),"utf8"));
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

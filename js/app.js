/* Parcel labels — themes, boot, senders, address book, log, costs
   Loaded in order from index.html; plain scripts sharing one global scope. */
/* ---------- themes (Settings tab) ---------- */
const TKEY = "tapal-theme";
/* value, name, [paper, ink, accent] preview chips — keep in step with css/theme.css */
const THEMES = [
  ["","Post office",["#fff","#15171c","#b3111c"]],
  ["night","Night",["#20242e","#e8eaf0","#ff6d76"]],
  ["slate","Slate",["#272620","#e7e4dc","#f2846a"]],
  ["kraft","Kraft paper",["#f8f1e2","#2c2114","#a33b1f"]],
  ["indigo","Indigo mail",["#eceefa","#1b1f3b","#2a3f9c"]],
  ["sakura","Sakura",["#fffafc","#3a2330","#c0395c"]],
  ["forest","Forest",["#e8f0e7","#13241c","#1c6b3f"]],
  ["contrast","High contrast",["#fff","#000","#000"]]
];
let theme = "";
try{ theme = localStorage.getItem(TKEY) || ""; }catch(e){}
if(theme) document.body.dataset.theme = theme;

function renderThemes(){
  const g = $("themeGrid"); if(!g) return;
  g.innerHTML = THEMES.map(([v,n,c]) =>
    `<button class="sw ${v === theme ? "on" : ""}" data-theme="${v}" aria-pressed="${v === theme}">
      <span class="chips">${c.map(x => `<i style="background:${x}"></i>`).join("")}</span>
      <span class="nm">${n}</span></button>`).join("");
}
$("themeGrid").addEventListener("click", e => {
  const b = e.target.closest("[data-theme]"); if(!b) return;
  theme = b.getAttribute("data-theme");
  if(theme) document.body.dataset.theme = theme; else delete document.body.dataset.theme;
  try{ localStorage.setItem(TKEY, theme); }catch(_){}
  renderThemes();
});
renderThemes();

/* ---------- tabs ---------- */
function showTab(name){
  $("tabLabels").style.display   = name === "labels" ? "" : "none";
  $("tabBook").style.display = name === "book" ? "" : "none";
  $("tabHistory").style.display = name === "history" ? "" : "none";
  $("tabSettings").style.display = name === "settings" ? "" : "none";
  document.querySelectorAll("#tabs .tab").forEach(t => {
    const on = t.getAttribute("data-tab") === name;
    t.classList.toggle("on", on);
    t.setAttribute("aria-selected", on);
  });
  const bar = document.querySelector(".bar");
  if(bar) bar.style.display = name === "labels" ? "" : "none";
}
$("tabs").addEventListener("click", e => {
  const t = e.target.closest("[data-tab]"); if(t){
    if(t.dataset.tab === "history" && $("missingCount").textContent){ $("missingOnly").checked = true; renderLog(); }
    showTab(t.getAttribute("data-tab"));
  }
});

const bookingCurrencies = {
  India:"INR", Japan:"JPY", "United States":"USD", "United Kingdom":"GBP",
  Singapore:"SGD", Australia:"AUD", "United Arab Emirates":"AED"
};
const bookingServices = {
  India:["Speed Post", "India Post Parcel (surface)", "DTDC", "Delhivery", "Blue Dart", "Xpressbees"],
  Japan:["Japan Post", "Yamato Transport"]
};

function localBookingDate(now = new Date()){
  const pad = n => String(n).padStart(2, "0");
  return [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join("-");
}

let bookingOrigin = null;
function senderCountry(){
  return activeSender().country || (activeSenderId ? "India" : "");
}
function startBooking(row){
  const country = senderCountry();
  const carriers = bookingServices[country] || [];
  const services = [...carriers, "Bus parcel", "Hand carried", "Other service"];
  if(row?.service && !services.includes(row.service)) services.push(row.service);
  const service = $("lgService");
  service.replaceChildren(new Option("Select service", ""), ...services.map(s => new Option(s, s)));
  service.value = row ? row.service || "" : carriers[0] || "";
  $("lgCurrency").value = row ? row.cost_currency || "" : bookingCurrencies[country] || "";
  $("lgDate").value = row ? row.booked_on || "" : localBookingDate();
  bookingOrigin = country;
}

/* ---------- local fallback (Claude sandbox → window.storage, hosted → localStorage) ---------- */
const LKEY = "parcel-label-data";
const local = {
  async get(){
    if(window.storage){
      let record;
      try{ record = await window.storage.get(LKEY); }
      catch(e){ if(!/not found|does not exist/i.test(e.message)) throw e; }
      if(record) return JSON.parse(record.value);
    }
    const v = localStorage.getItem(LKEY);
    return v ? JSON.parse(v) : null;
  },
  async write(d){
    const data = JSON.stringify(d);
    if(window.storage) await window.storage.set(LKEY, data);
    else localStorage.setItem(LKEY, data);
  },
};

// Older browsers and plain HTTP can coordinate tabs through an IndexedDB
// read/write transaction. Only the lock lives here; existing records stay in place.
function withDeviceLock(change){
  if(window.navigator?.locks) return window.navigator.locks.request(LKEY, change);
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("tapal-device-lock", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("mutex");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("mutex", "readwrite");
      const mutex = tx.objectStore("mutex");
      let finished = false, result, failure;
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onabort = () => { db.close(); reject(failure || tx.error); };
      // Keep the lock while an asynchronous host storage adapter is writing.
      function hold(){ if(!finished) mutex.get(0).onsuccess = hold; }
      mutex.get(0).onsuccess = () => {
        hold();
        change().then(value => { result = value; finished = true; },
          error => { failure = error; finished = true; tx.abort(); });
      };
    };
  });
}

let pendingDeviceWrites = 0;
function saveDeviceRows(key, change){
  pendingDeviceWrites++;
  return withDeviceLock(async () => {
    const data = await local.get() || {};
    const rows = key === "senders" ? deviceSenders(data) : data[key] || [];
    const next = change(rows);
    await local.write({...data, [key]:next});
    return next;
  }).finally(() => { pendingDeviceWrites--; });
}

function deviceId(){ return crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-"); }

function deviceSenders(data){
  return data.senders || (data.sender && (data.sender.name || data.sender.addr) ? [{id:"s1", ...data.sender}] : []);
}

function saveDeviceAddress(key, row, editing){
  return saveDeviceRows(key, rows => {
    if(!editing) return [...rows, row];
    if(!rows.some(item => item.id === row.id)) throw Error("This address was removed. Reopen the address book.");
    return rows.map(item => item.id === row.id ? {...item, ...row} : item);
  });
}

async function saveDeviceShipments(change){
  shipments = await saveDeviceRows("shipments", change);
}

function setConn(state, text){
  const el = $("conn");
  el.className = "conn " + state;
  $("connTxt").textContent = text;
  if($("acctConn")) $("acctConn").textContent = text;
}

/* ---------- edit windows (overlay, so the page doesn't jump) ---------- */
function openModal(id){ $(id).classList.add("open"); document.body.classList.add("locked"); }
function closeModal(id){
  $(id).classList.remove("open");
  if(!document.querySelector(".modal.open")) document.body.classList.remove("locked");
}
function closeAddrModal(){ closeModal("addModal"); editingId = null; }
function closeSenderModal(){ closeModal("senderModal"); editingSenderId = null; }
document.addEventListener("keydown", e => {
  if(e.key !== "Escape") return;
  const open = document.querySelector(".modal.open");
  if(open) (open.id === "addModal" ? closeAddrModal : closeSenderModal)();
});
["addModal","senderModal"].forEach(id => {
  /* click on the backdrop itself, not inside the box */
  $(id).addEventListener("mousedown", e => {
    if(e.target === $(id)) (id === "addModal" ? closeAddrModal : closeSenderModal)();
  });
});

/* ---------- boot ---------- */
function showApp(v){
  $("tabs").style.display = v ? "" : "none";
  $("appMain").style.display = v ? "" : "none";
  document.querySelector(".top").style.display = v ? "" : "none";
  $("authCard").style.display = v ? "none" : "";
  document.querySelector(".bar").style.display =
    v && $("tabLabels").style.display !== "none" ? "" : "none";
  $("signOut").style.display = session ? "inline-block" : "none";
  $("acctEmail").textContent = session ? (session.email || "signed in") : "Not signed in";
}

let waitingForSession = false;
function waitForSession(){
  waitingForSession = true;
  setConn("off", "Couldn’t verify your saved sign-in. Reconnect or tap Retry.");
  $("retryLoad").style.display = "";
}
window.addEventListener("online", () => { if(waitingForSession && !showingDevice) boot(); });

let loadingConnection = null;
let showingDevice = false;
function boot(){
  if(!loadingConnection){
    $("appMain").inert = true;
    $("tabs").inert = true;
    document.querySelector(".bar").inert = true;
    loadingConnection = connect().finally(() => {
      $("appMain").inert = false;
      $("tabs").inert = false;
      document.querySelector(".bar").inert = false;
      loadingConnection = null;
    });
  }
  return loadingConnection;
}
async function showDeviceRecords(){
  online = false;
  setConn("off", "Device only · Tap Retry to reconnect.");
  if(!showingDevice){
    try{ await loadAll(); showingDevice = true; }
    catch(e){ say("Could not read device records: " + e.message); }
  }
  applyRole();
  showApp(true);
  $("retryLoad").style.display = "";
}
async function connect(){
  waitingForSession = false;
  setConn("", "Checking sign-in…");
  $("retryLoad").style.display = "none";
  const hadSession = Boolean(session);
  let s;
  try{ s = await ensureSession(); }
  catch(e){ waitForSession(); return; }
  if(hadSession && !s){ await doSignOut(true); return; }
  if(!s){
    let reachable = true;
    try{ reachable = (await fetch(AUTH + "health", { headers:{ apikey: SUPABASE_KEY } })).ok; }catch(e){ reachable = false; }
    if(reachable){
      setConn("off", "Signed out");
      showApp(false);
    }else{
      await showDeviceRecords();
    }
    return;
  }
  try{
    await rest("tapal_settings?select=id&limit=1");
    role = await rest("rpc/tapal_my_role", { method:"POST", body:"{}" });
    if(!role){
      await doSignOut(false);
      $("authStatus").textContent = "That email isn't on the access list. Ask an admin to add it, then sign in again.";
      return;
    }

  }catch(e){
    if(e.sessionCheckFailed){ waitForSession(); return; }
    if(e.status === 401 || e.status === 403){ await doSignOut(true); return; }
    await showDeviceRecords();
    return;
  }
  await loadParcelRecords();
}

async function loadParcelRecords(){
  $("retryLoad").style.display = "none";
  setConn("", "Loading senders, addresses and shipments…");
  try{
    await loadAll(true);
  }catch(e){
    if(e.sessionCheckFailed){ waitForSession(); return; }
    if(e.status === 401 || e.status === 403){ await doSignOut(true); return; }
    setConn("off", showingDevice ? "Device only · Online History could not load. Tap Retry." : "Couldn’t load parcel records. Check your connection and retry.");
    $("retryLoad").style.display = "";
    return;
  }
  applyRole();
  showApp(true);
  if(online && canWrite()) restorePendingShipment();
  if(online) setConn("live", "Synced — " + (session.email || "signed in") + " · " + role);
}

$("retryLoad").onclick = () => {
  if(showingDevice && ($("shipmentEntry").open || pendingDeviceWrites || document.querySelector(".modal.open, #logBody details[open]"))){
    say("Finish or cancel your device entry before reconnecting.");
    return;
  }
  return boot();
};

/* Viewers can browse, select and print, but not change anything. */
function applyRole(){
  const ro = !canWrite();
  ["showSender","saveSender","showAdd","saveAddr","addLog","importAddresses"].forEach(i => { $(i).disabled = ro; });
  $("acctRole").textContent = role || "—";
  if(ro){
    $("roleNote").textContent = "Read only — your role is viewer.";
  }
}

$("sendLink").onclick = async () => {
  const email = $("authEmail").value.trim();
  const note = m => { $("authStatus").textContent = m; };
  if(!/.+@.+\..+/.test(email)){ note("Enter a valid email first."); return; }
  note("Sending…");
  try{
    await authFetch("otp?redirect_to=" + encodeURIComponent(location.origin + location.pathname),
                    { email, create_user: true }, false);
    note("Link sent. Open the email on this device and tap the link.");
  }catch(e){ note("Could not send: " + String(e.message || e).slice(0,120)); }
};

$("googleLogin").onclick = () => {
  $("authStatus").textContent = "Opening Google…";
  location.href = AUTH + "authorize?provider=google&redirect_to="
    + encodeURIComponent(location.origin + location.pathname);
};

async function doSignOut(expired){
  try{ if(session) await authFetch("logout", {}, true); }catch(e){}
  showingDevice = false;
  $("deviceHistory").hidden = true;
  $("deviceHistoryRows").textContent = "";
  setPendingShipment(null);
  saveSession(null);
  role = null;
  preparedParcels = []; preparedLabel = null; autoFilledDestination = null; recordingPrepared = false;
  updateRecordAction();
  senders = []; activeSenderId = null; setBookRows([]); $("archivedList").textContent = ""; $("bookStatus").textContent = ""; shipments = [];
  $("trackingCode").value = ""; $("trackingResult").textContent = "";
  showTab("labels");
  showApp(false);
  setConn("off", "Signed out");
  $("authStatus").textContent = expired ? "Session expired — sign in again." : "";
}
$("signOut").onclick = () => doSignOut(false);

async function loadShipmentHistory(){
  const rows = [];
  const limit = 200;
  for(;;){
    const page = await rest("tapal_shipments?select=*&order=booked_on.desc.nullslast,id.asc&limit=" + limit + "&offset=" + rows.length);
    rows.push(...page);
    if(page.length < limit) return rows;
  }
}
async function loadAll(fromServer = online){
  if(fromServer){
    const [s,a,l] = await Promise.all([
      rest("tapal_senders?user_id=eq." + session.user_id + "&select=*&order=created_at"),
      loadBookRows(),
      loadShipmentHistory()
    ]);
    if(showingDevice){
      const panel = $("deviceHistory");
      $("deviceHistoryRows").innerHTML = shipments.map(row =>
        `<li>${[row.booked_on,row.recipient,row.service,row.status,row.consignment_no,shipmentCostText(row),row.contents].filter(Boolean).map(esc).join(" · ")}</li>`).join("");
      panel.hidden = !shipments.length;
      panel.open = false;
      preparedParcels = []; preparedLabel = null; batchId = null;
      updateRecordAction();
      closeShipmentEntry();
      $("contents").value = "";
      for(const id of Object.keys(ui)) delete ui[id];
      sui = {};
      showingDevice = false;
    }
    online = true;
    senders = (s || []).map(x => ({ id:x.id, address_romaji:x.address_romaji, name:x.name, phone:x.phone, addr:x.line, city:x.city, district:x.district || "", state:x.state || "", pin:x.pin, country:x.country || "India", label:x.label || "" }));
    setBookRows((a || []).map(x => ({...x, addr:x.line})));
    shipments = l || [];
  }else{
    const d = await local.get() || {};
    /* old single-sender snapshots migrate into a one-item list */
    senders = deviceSenders(d);
    activeSenderId = d.activeSenderId || null;
    setBookRows(d.addresses || []); shipments = d.shipments || [];
  }
  try{ activeSenderId = localStorage.getItem(AKEY) || activeSenderId; }catch(e){}
  if(!senders.some(x => x.id === activeSenderId)) activeSenderId = senders[0] ? senders[0].id : null;
  renderSenders(); render(); renderLog(); fillLogPicker(); renderCosts();
  restorePrepared();
}

/* ---------- senders (From blocks) ---------- */
function bookEntries(rows, own){
  if(!rows.length) return '<p class="empty">No addresses saved yet.</p>';
  return rows.map(a => `<div class="entry"><div class="body"><div class="who">${esc(a.label || a.name)}</div>
    <div class="addr">${esc(addrLines(a, {name:!!a.label, phone:true}).join("\n"))}</div></div>
    ${canWrite() ? `<div class="acts"><button class="btn ghost small" data-${own?"sedit":"edit"}="${esc(a.id)}">Edit</button>
    ${!own || rows.length > 1 ? `<button class="btn danger small" data-${own?"sdel":"del"}="${esc(a.id)}">${own ? "Delete" : "Archive"}</button>` : ""}</div>` : ""}</div>`).join("");
}
function renderHome(){
  const from = $("homeFrom");
  from.replaceChildren(...senders.map(s => new Option(s.label || s.name, s.id)));
  if(!senders.length) from.add(new Option("Add a sender in Address book", ""));
  from.value = activeSenderId || "";
  const choices = [...addresses, ...senders.filter(s => s.id !== activeSenderId)];
  addresses.forEach(a => { if(!ui[a.id]) ui[a.id] = {sel:false,copies:1,fragile:false}; });
  const selected = recipients();
  updateCustoms(activeSender(), selected);
  $("toSummary").textContent = "To · " + (selected.length === 1 ? selected[0].label || selected[0].name : selected.length ? selected.length + " recipients" : "Choose recipients");
  $("homeTo").innerHTML = choices.map(a => `<label class="opt"><input type="checkbox" data-own="${senders.includes(a)}" value="${esc(a.id)}" ${(senders.includes(a)?sui:ui)[a.id]?.sel?"checked":""}>${esc(a.label || a.name)} · ${esc(a.country || "India")}</label>`).join("") || "Add a destination in Address book.";
  $("recipientOptions").innerHTML = selected.map(a => {
    const own = senders.includes(a), state = (own?sui:ui)[a.id];
    return `<div class="row" data-id="${esc(a.id)}" data-own="${own}"><strong>${esc(a.label || a.name)}</strong>
      <label>Copies <input class="copies" type="number" min="1" max="20" value="${state.copies || 1}"></label>
      <label><input type="checkbox" ${state.fragile?"checked":""}> Fragile</label></div>`;
  }).join("");
  invalidateChangedLabel();
  renderCosts();
}
function renderSenders(){
  senders.forEach(s => { if(!sui[s.id]) sui[s.id] = {sel:false,copies:1,fragile:false}; });
  $("senderList").innerHTML = bookEntries(senders,true);
  renderHome();
}
$("homeFrom").onchange = e => {
  activeSenderId = e.target.value;
  sui[activeSenderId].sel = false;
  try{localStorage.setItem(AKEY, activeSenderId);}catch(_){}
  renderHome(); fillLogPicker();
};
$("homeTo").onchange = e => {
  const t = e.target;
  (t.dataset.own === "true" ? sui : ui)[t.value].sel = t.checked;
  renderHome();
};
$("recipientOptions").onchange = e => {
  const t = e.target, row = t.closest("[data-id]");
  const state = (row.dataset.own === "true" ? sui : ui)[row.dataset.id];
  if(t.type === "checkbox") state.fragile = t.checked;
  else { state.copies = Math.max(1,Math.min(20,parseInt(t.value,10)||1)); t.value = state.copies; }
};
$("senderList").addEventListener("click", async e => {
  const ed = e.target.getAttribute("data-sedit");
  if(ed){ startSenderEdit(ed); return; }
  const dl = e.target.getAttribute("data-sdel");
  if(dl) await deleteSender(dl);
});

function senderForm(s){
  buildForm("s", (s && s.country) || "India", s ? recVals(s) : {});
  $("senderStatus").textContent = "";
  $("senderModalTitle").textContent = s ? "Edit sender" : "Add a sender";
  openModal("senderModal");
  $("s_name").focus();
}
function startSenderEdit(id){ editingSenderId = id; senderForm(senders.find(s => s.id === id)); }
$("showSender").onclick   = () => { editingSenderId = null; senderForm(null); };
$("cancelSender").onclick = closeSenderModal;
$("closeSender").onclick  = closeSenderModal;

/* One print state lookup for both lists — address book rows live in ui, your
   own addresses used as recipients live in sui. */
const prState = id => ui[id] || sui[id] || { sel:false, copies:1, fragile:false };
/* Today's recipients: ticked address-book rows, plus any of your own addresses
   ticked "Send here" (never the one you're sending from). */
function recipients(){
  const own = senders.filter(s => s.id !== activeSenderId && sui[s.id] && sui[s.id].sel);
  return [...addresses.filter(a => ui[a.id] && ui[a.id].sel), ...own];
}

/* ---------- address book ---------- */
function render(){
  $("list").innerHTML = bookEntries(addresses,false);
  renderArchived();
  renderHome();
}
$("list").addEventListener("click", async e => {
  const ed = e.target.getAttribute("data-edit"); if(ed){ startEdit(ed); return; }
  const dl = e.target.getAttribute("data-del");
  if(dl){
    if(canWrite() && confirm("Archive this recipient? You can restore it from Archived recipients.")) await changeArchive(dl, true);
  }
});

function openAddr(a){
  editingId = a ? a.id : null;
  buildForm("r", (a && a.country) || "India", a ? recVals(a) : {});
  $("rNote").textContent = "";
  $("addModalTitle").textContent = a ? "Edit address" : "Add an address";
  openModal("addModal"); $("r_name").focus();
}
function startEdit(id){ openAddr(addresses.find(x => x.id === id)); }
$("showAdd").onclick = () => openAddr(null);
$("cancelAddr").onclick = closeAddrModal;
$("closeAddr").onclick  = closeAddrModal;

async function persistAddress(){
  const v = readForm("r");
  if(!v.name){ say("Add a recipient name first."); return; }
  const perr = postalError(v); if(perr){ say(perr); return; }
  const rec = toRec(v, addresses.find(a => a.id === editingId));

  if(online){
    let row;
    try{
      const out = editingId
        ? await rest("tapal_addresses?id=eq." + editingId, { method:"PATCH", headers:RETURN, body:JSON.stringify(rec) })
        : await rest("tapal_addresses", { method:"POST", headers:RETURN, body:JSON.stringify(rec) });
      row = { ...out[0], addr: out[0].line };
    }catch(e){ say("Save failed: " + e.message); return; }
    if(!(row.id in ui)) ui[row.id] = { sel:false, copies:1 };
    addresses = editingId ? addresses.map(a => a.id===editingId?row:a) : [...addresses,row];
    addresses.sort((x,y) => (x.name||"").localeCompare(y.name||""));
  }else{
    const id = editingId || deviceId();
    try{ setBookRows(await saveDeviceAddress("addresses", {...rec, id, addr:rec.line}, !!editingId)); }
    catch(e){ $("rNote").textContent = "Save failed: " + e.message; return; }
  }
  closeAddrModal();
  render(); fillLogPicker(); say("Saved.");
}

async function persistSender(){
  const note = m => { $("senderStatus").textContent = m; };
  const v = readForm("s");
  if(!v.name){ note("Add a sender name first."); return; }
  /* Each country validates its own postal format (a sender's is optional even in India). */
  if(v.pin){ const perr = postalError(v); if(perr){ note(perr); return; } }
  const r0 = toRec(v, senders.find(s => s.id === editingSenderId));
  const rec = { address_romaji:r0.address_romaji, label:r0.label || "", name:r0.name, phone:r0.phone, addr:r0.line, city:r0.city, district:r0.district || "", state:r0.state || "", pin:r0.pin || "", country:r0.country };
  const id = editingSenderId;
  note("Saving…");
  if(online){
    try{
      const body = JSON.stringify({ address_romaji:rec.address_romaji, label:rec.label || null, name:rec.name, phone:rec.phone, line:rec.addr, city:rec.city, district:rec.district || null, state:rec.state || null, pin:rec.pin || null, country:rec.country });
      if(id){
        await rest("tapal_senders?id=eq." + id, { method:"PATCH", headers:RETURN, body });
        senders = senders.map(s => s.id === id ? { ...s, ...rec } : s);
      }else{
        const out = await rest("tapal_senders", { method:"POST", headers:RETURN, body });
        const r = out[0];
        senders.push({ id:r.id, address_romaji:r.address_romaji, label:r.label || "", name:r.name, phone:r.phone, addr:r.line, city:r.city, district:r.district || "", state:r.state || "", pin:r.pin, country:r.country || "India" });
        activeSenderId = r.id;
      }
      note(id ? "Sender updated." : "Sender saved.");
    }catch(e){ note("Save failed: " + e.message); return; }
  }else{
    const row = {...rec, id:id || deviceId()};
    try{ senders = await saveDeviceAddress("senders", row, !!id); }
    catch(e){ note("Save failed: " + e.message); return; }
    if(!id) activeSenderId = row.id;
    note("Saved on this device only — not synced. " + (location.protocol === "file:"
      ? "Opening the file directly blocks Supabase; serve it over http://localhost instead."
      : "Check the connection badge at the top."));
  }
  try{ localStorage.setItem(AKEY, activeSenderId); }catch(_){}
  editingSenderId = null;
  closeModal("senderModal");
  renderSenders(); fillLogPicker();
}
function bindSaveButton(id, save){
  const button = $(id);
  button.onclick = async () => {
    if(button.disabled) return;
    button.disabled = true;
    try{ await save(); }finally{ button.disabled = !canWrite(); }
  };
}
bindSaveButton("saveAddr", persistAddress);
bindSaveButton("saveSender", persistSender);

async function deleteSender(id){
  if(senders.length < 2) return;
  const note = m => { $("senderStatus").textContent = m; };
  if(!confirm("Delete this sender?")) return;
  if(online){
    try{ await rest("tapal_senders?id=eq." + id, { method:"DELETE" }); }
    catch(e){ note("Delete failed: " + e.message); return; }
  }
  if(online) senders = senders.filter(s => s.id !== id);
  else{
    try{ senders = await saveDeviceRows("senders", rows => {
      if(rows.length <= 1) throw Error("Keep at least one sender.");
      return rows.filter(s => s.id !== id);
    }); }catch(e){ say("Delete failed: " + e.message); return; }
  }
  delete sui[id];
  if(!senders.some(s => s.id === activeSenderId)) activeSenderId = senders[0] ? senders[0].id : null;
  try{ if(activeSenderId) localStorage.setItem(AKEY, activeSenderId); }catch(_){}
  renderSenders(); fillLogPicker(); note("Sender deleted.");
}
$("selAll").onclick  = () => { addresses.forEach(a => ui[a.id].sel = true);  render(); };
$("selNone").onclick = () => { addresses.forEach(a => ui[a.id].sel = false); senders.forEach(s => sui[s.id].sel = false); render(); };
/* Master fragile toggle — sets every address at once; rows stay individually editable. */
$("optFragile").onchange = e => {
  addresses.forEach(a => ui[a.id].fragile = e.target.checked);
  senders.forEach(s => { if(sui[s.id]) sui[s.id].fragile = e.target.checked; });
  render(); renderSenders();
};

/* ---------- shipment log ---------- */
let preparedParcels = [];
let preparedLabel = null;
let autoFilledDestination = null;
let recordingPrepared = false;
let pendingShipment = null;
let batchId = null;
function preparedKey(){
  return "tapal-prepared:" + (online ? "account:" : "device:") + (session?.user_id || "local");
}
function storePrepared(newBatch = false){
  try{
    const key = preparedKey();
    if(!newBatch && JSON.parse(localStorage.getItem(key))?.id !== batchId) return;
    if(preparedParcels.length){
      localStorage.setItem(key, JSON.stringify({id:batchId, sender:activeSenderId, parcels:preparedParcels}));
    }else localStorage.removeItem(key);
  }catch(e){ say("Could not save the prepared parcel on this device. Keep this tab open."); }
}
function restorePrepared(){
  let draft;
  try{ draft = JSON.parse(localStorage.getItem(preparedKey())); }catch(e){ return; }
  if(!canWrite() || !draft?.id || !Array.isArray(draft.parcels) || !senders.some(s => s.id === draft.sender)) return;
  const available = new Map([
    ...addresses.map(a => [a.id,ui[a.id]]),
    ...senders.filter(s => s.id !== draft.sender).map(s => ["sender:" + s.id,sui[s.id]])
  ]);
  const recorded = new Set(shipments.map(s => s.id));
  const remaining = draft.parcels.filter(p => p?.id && available.has(p.key) && !recorded.has(p.id));
  batchId = draft.id;
  preparedParcels = remaining;
  if(!remaining.length){ storePrepared(); updateRecordAction(); return; }
  activeSenderId = draft.sender;
  for(const state of [...Object.values(ui), ...Object.values(sui)]) state.sel = false;
  for(const parcel of remaining) available.get(parcel.key).sel = true;
  $("contents").value = remaining[0].contents;
  preparedLabel = currentLabel();
  renderHome(); fillLogPicker(); updateRecordAction();
}
function pendingKey(){ return "tapal-pending-shipment:" + session.user_id; }
function setPendingShipment(attempt){
  pendingShipment = attempt;
  if(session && session.user_id){
    try{
      if(attempt) sessionStorage.setItem(pendingKey(), JSON.stringify(attempt));
      else sessionStorage.removeItem(pendingKey());
    }catch(e){ /* In restricted storage, retries still use this page's attempt. */ }
  }
  $("shipmentFields").disabled = !!attempt;
  $("addLog").textContent = attempt ? "Retry save" : "Confirm shipment";
}

function restorePendingShipment(){
  let attempt;
  try{ attempt = JSON.parse(sessionStorage.getItem(pendingKey())); }catch(e){ return; }
  if(!attempt || !attempt.row || !attempt.row.id) return;
  if(shipments.some(row => row.id === attempt.row.id)){
    setPendingShipment(null);
    say("Your previous shipment was recorded.");
    return;
  }
  setPendingShipment(attempt);
  const row = attempt.row;
  const picker = $("lgTo");
  if(!Array.from(picker.options).some(option => option.value === attempt.selected)){
    picker.add(new Option(row.recipient, attempt.selected));
  }
  picker.value = attempt.selected;
  $("lgContents").value = row.contents;
  $("lgCost").value = row.cost ?? "";
  startBooking(row);
  $("lgStatus").value = row.status;
  $("lgUntracked").checked = row.consignment_no === UNTRACKED;
  $("lgCn").disabled = $("lgUntracked").checked;
  $("lgCn").value = $("lgUntracked").checked ? "" : row.consignment_no;
  showTab("history");
  $("shipmentEntry").open = true;
  say("The previous save was interrupted. Tap Retry save to finish.");
}

async function saveServerShipment(row){
  const result = await rest("tapal_shipments?on_conflict=id", {
    method:"POST",
    headers:{Prefer:"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify(row)
  });
  if(result?.[0]?.id === row.id) return result[0];
  // An earlier request may already have committed. Read it without overwriting later edits.
  const existing = await rest("tapal_shipments?id=eq." + encodeURIComponent(row.id) + "&select=*");
  if(existing?.[0]?.id === row.id) return existing[0];
  throw new Error("Couldn’t confirm the shipment. Tap Retry save.");
}
// Compare the actual sender, destinations and contents that identify this parcel batch.
function currentLabel(){
  return JSON.stringify([activeSender(), recipients(), $("contents").value]);
}
function updateRecordAction(){
  const button = $("recordPrepared");
  button.style.display = canWrite() && preparedParcels.length ? "" : "none";
  if(preparedParcels.length){
    const destination = preparedParcels.length === 1
      ? preparedParcels[0].name : preparedParcels.length + " recipients";
    button.textContent = "Record as sent · " + destination;
  }
}
function invalidateChangedLabel(){
  if(preparedLabel === null || preparedLabel === currentLabel()) return;
  preparedLabel = null;
  preparedParcels = [];
  storePrepared();
  updateRecordAction();
  if(!pendingShipment && !$("addLog").disabled){
    if(recordingPrepared) closeShipmentEntry();
    else if(autoFilledDestination && $("lgTo").value === autoFilledDestination) $("lgTo").value = "";
  }
  autoFilledDestination = null;
  say("Label changed. Preview it again before recording the parcel.");
}
$("contents").addEventListener("input", invalidateChangedLabel);
$("lgTo").addEventListener("change", () => { autoFilledDestination = null; });

function rememberPreparedParcels(prefill = false){
  invalidateChangedLabel();
  if(!canWrite()) return;
  if(preparedLabel === null){
    batchId = deviceId();
    preparedLabel = currentLabel();
    preparedParcels = recipients().map(dest => ({
      id:deviceId(),
      key: senders.includes(dest) ? "sender:" + dest.id : dest.id,
      name: dest.label || dest.name,
      contents: $("contents").value
    }));
    storePrepared(true);
  }
  updateRecordAction();
  if(prefill && !pendingShipment && !$("shipmentEntry").open){
    autoFilledDestination = preparedParcels.length === 1 ? preparedParcels[0].key : "";
    $("lgTo").value = autoFilledDestination;
  }
}
$("recordPrepared").onclick = () => {
  invalidateChangedLabel();
  if(!canWrite() || !preparedParcels.length) return;
  if(pendingShipment || $("addLog").disabled){
    showTab("history"); $("shipmentEntry").open = true; return;
  }
  autoFilledDestination = null;
  recordingPrepared = true;
  startBooking();
  fillLogPicker();
  $("lgTo").value = preparedParcels.length === 1 ? preparedParcels[0].key : "";
  $("lgUntracked").checked = false; $("lgCn").disabled = false; $("lgCn").value = ""; $("lgCost").value = "";
  $("lgContents").value = preparedParcels[0].contents;
  $("lgStatus").value = "booked";
  showTab("history");
  $("shipmentEntry").open = true;
  $("lgTo").focus();
};
function closeShipmentEntry(){
  bookingOrigin = null;
  $("lgContents").value = "";
  $("lgCn").value = "";
  $("lgCn").disabled = false;
  $("lgUntracked").checked = false;
  $("lgCost").value = "";
  autoFilledDestination = null;
  recordingPrepared = false;
  $("lgStatus").value = "booked";
  $("shipmentEntry").open = false;
  fillLogPicker();
  $("lgTo").value = "";
}
$("cancelShipment").onclick = () => {
  if(pendingShipment && !confirm("The previous save may have reached History. Stop retrying this shipment?")) return;
  setPendingShipment(null);
  closeShipmentEntry();
};
$("shipmentEntry").addEventListener("toggle", () => {
  if($("shipmentEntry").open && !recordingPrepared && !pendingShipment){
    if(bookingOrigin === null || (bookingOrigin !== senderCountry() && !$("lgCost").value)) startBooking();
  }
  if(!$("shipmentEntry").open && recordingPrepared && !pendingShipment && !$("addLog").disabled) closeShipmentEntry();
});
function fillLogPicker(){
  if(pendingShipment) return;
  const sel = $("lgTo"), cur = sel.value;
  sel.innerHTML = '<option value="">Select</option>';
  addresses.forEach(a => sel.add(new Option(a.label ? `${a.name} — ${a.label}` : a.name, a.id)));
  for(const s of senders){
    if(s.id !== activeSenderId || (recordingPrepared && preparedParcels.some(p => p.key === "sender:" + s.id))) sel.add(new Option("My address — " + senderDestinationName(s), "sender:" + s.id));
  }
  if(recordingPrepared){
    const allowed = new Set(preparedParcels.map(parcel => parcel.key));
    for(const option of Array.from(sel.options)){
      if(option.value && !allowed.has(option.value)) option.remove();
    }
  }
  sel.value = Array.from(sel.options).some(option => option.value === cur) ? cur : "";
}
function senderDestinationName(s){
  return [s.name, s.label || s.city, s.country].filter(Boolean).join(" — ");
}
const UNTRACKED = "Untracked service";
function canPrintBarcode(value){
  return typeof value === "string" && value.trim() !== "" && value !== UNTRACKED &&
    value.length <= 48 && !/[^ -~]/.test(value);
}
function needsTracking(row){
  return ["booked","in transit","delivered","problem"].includes(row.status) && !(row.consignment_no || "").trim();
}
let trackingRequest = 0;
$("trackingCode").oninput = () => { trackingRequest++; $("trackingResult").textContent = ""; };
$("trackingLookup").onsubmit = async event => {
  event.preventDefault();
  const code = $("trackingCode").value.trim(), output = $("trackingResult");
  const request = ++trackingRequest, owner = session?.user_id;
  if(!online || !owner){ output.textContent = "Sign in online to check carrier status."; return; }
  output.textContent = "Checking carrier status…";
  try{
    if(!await ensureSession() || session?.user_id !== owner) throw Error("Sign in again to check carrier status.");
    const response = await fetch("/.netlify/functions/parcel-status",{
      method:"POST",headers:{Authorization:"Bearer " + session.access_token,"Content-Type":"application/json"},
      body:JSON.stringify({code})
    });
    if(!response.headers.get("content-type")?.includes("application/json")) throw Error("Live tracking is unavailable on this host.");
    const data = await response.json();
    if(!response.ok || !data.status) throw Error(data.error || "Carrier lookup failed.");
    if(request === trackingRequest && session?.user_id === owner){
      const date = new Date(data.updated);
      output.textContent = [code,data.carrier,data.status.replace(/_/g," "),data.updated && Number.isFinite(date.getTime()) ? date.toLocaleString() : ""].filter(Boolean).join(" · ");
    }
  }catch(error){ if(request === trackingRequest && session?.user_id === owner) output.textContent = error.message; }
};
$("missingOnly").onchange = renderLog;
$("lgUntracked").onchange = () => { $("lgCn").disabled = $("lgUntracked").checked; };
function shipmentCostText(row){
  if(row.cost == null) return "";
  return row.cost_currency ? row.cost_currency + " " + row.cost : row.cost + " (currency unrecorded)";
}
function renderLog(){
  const b = $("logBody");
  const missing = shipments.filter(needsTracking);
  $("missingCount").textContent = missing.length ? "· " + missing.length + " missing" : "";
  const visible = $("missingOnly").checked ? missing : shipments;
  if(!visible.length && $("missingOnly").checked){ b.innerHTML = '<tr><td colspan="6">No missing tracking numbers.</td></tr>'; return; }
  if(!shipments.length){ b.innerHTML = '<tr><td colspan="6" class="empty">Nothing logged yet.</td></tr>'; return; }
  b.innerHTML = visible.map(s => `<tr>
    <td>${esc(s.booked_on||"")}</td>
    <td>${esc(s.recipient||"")}</td>
    <td>${esc(s.service||"")}${s.cost == null ? "" : `<div>Cost · ${esc(shipmentCostText(s))}</div>`}</td>
    <td class="cn">${needsTracking(s) && canWrite() ? `<details><summary>Add tracking number</summary><input aria-label="Tracking number" type="text"><button class="btn small" data-track="${esc(s.id)}">Save</button><button class="btn ghost small" data-untracked="${esc(s.id)}">Untracked service</button></details>` : esc(s.consignment_no || (needsTracking(s) ? "Missing" : "—"))}
      ${canPrintBarcode(s.consignment_no) ? `<button type="button" class="btn ghost small" data-barcode="${esc(s.id)}">Barcode label</button>` : ""}</td>
    <td><span class="pill">${esc(s.status||"")}</span>
      ${s.status === "packed" && canWrite() ? `<button class="btn small" data-book="${esc(s.id)}">Mark booked</button>` : ""}</td>
    <td>${canWrite() ? `<button class="btn danger small" data-dellog="${s.id}">Remove</button>` : ""}</td></tr>`).join("");
}
$("logBody").addEventListener("click", async e => {
  if(e.target.dataset.barcode){
    const row = shipments.find(item => item.id === e.target.dataset.barcode);
    if(row) openBarcode(row,e.target);
    return;
  }
  const bookedId = e.target.dataset.book;
  if(bookedId && canWrite()){
    const button = e.target;
    button.disabled = true;
    const patch = {status:"booked", booked_on:localBookingDate()};
    try{
      if(online){
        const path = "tapal_shipments?id=eq." + encodeURIComponent(bookedId);
        const updated = await rest(path + "&status=eq.packed", {method:"PATCH",headers:RETURN,body:JSON.stringify(patch)});
        const row = updated[0] || (await rest(path + "&select=*"))[0];
        if(!row) throw Error("Shipment no longer exists. Reload History.");
        shipments = shipments.map(s => s.id === bookedId ? row : s);
      }else{
        await saveDeviceShipments(rows => rows.map(s => s.id === bookedId && s.status === "packed" ? {...s,...patch} : s));
      }
      renderLog();
    }catch(err){ say("Booking update failed: " + err.message); }
    finally{ button.disabled = false; }
    return;
  }
  const trackingId = e.target.dataset.track || e.target.dataset.untracked;
  if(trackingId && canWrite()){
    const row = shipments.find(s => s.id === trackingId);
    if(!row || !needsTracking(row)) return;
    const field = e.target.closest("details").querySelector("input");
    const value = e.target.dataset.untracked ? UNTRACKED : field.value.trim();
    if(!value){ field.focus(); return; }
    const controls = e.target.closest("details").querySelectorAll("button");
    controls.forEach(button => button.disabled = true);
    try{
      if(online){
        const previous = row.consignment_no == null ? "is.null" : "eq." + encodeURIComponent(row.consignment_no);
        const saved = await rest("tapal_shipments?id=eq." + encodeURIComponent(row.id) + "&consignment_no=" + previous,
          {method:"PATCH", headers:RETURN, body:JSON.stringify({consignment_no:value})});
        if(!saved.length){
          const current = await rest("tapal_shipments?id=eq." + encodeURIComponent(row.id) + "&select=consignment_no");
          if(current?.[0]?.consignment_no !== value){ say("Shipment changed. Reload History to see its current tracking number."); return; }
        }
      }
      if(online) row.consignment_no = value;
      else await saveDeviceShipments(rows => {
        const current = rows.find(s => s.id === row.id);
        if(!current || (current.consignment_no !== row.consignment_no && current.consignment_no !== value)){
          throw Error("Shipment changed. Reload History before editing.");
        }
        return rows.map(s => s.id === row.id ? {...s, consignment_no:value} : s);
      });
      renderLog();
    }catch(err){ say("Tracking update failed: " + err.message); }
    finally{ controls.forEach(button => button.disabled = false); }
    return;
  }
  const id = e.target.getAttribute("data-dellog"); if(!id) return;
  if(online) { try{ await rest("tapal_shipments?id=eq." + id, { method:"DELETE" }); }catch(e){ say("Delete failed: " + e.message); return; } }
  if(online) shipments = shipments.filter(s => s.id !== id);
  else{
    try{ await saveDeviceShipments(rows => rows.filter(s => s.id !== id)); }
    catch(e){ say("Delete failed: " + e.message); return; }
  }
  renderLog();
});
$("addLog").onclick = async () => {
  if(!canWrite() || $("addLog").disabled) return;
  const owner = session?.user_id;
  const selected = pendingShipment?.selected ?? $("lgTo").value;
  const prepared = preparedParcels.find(p => p.key === selected && (recordingPrepared || p.id === pendingShipment?.row.id));
  const addr = addresses.find(a => a.id === selected);
  const own = senders.find(s => "sender:" + s.id === selected);
  const amount = $("lgCost");
  if(!pendingShipment && (amount.validity?.badInput || amount.validity?.rangeUnderflow || amount.validity?.stepMismatch)){
    say("Enter a non-negative postage amount with up to two decimal places."); amount.focus(); return;
  }
  if(!pendingShipment && amount.value !== "" && !$("lgCurrency").value){
    say("Choose the currency for this postage cost."); $("lgCurrency").focus(); return;
  }
  const rec = {
    address_id: online && addr ? addr.id : null,
    recipient: own ? senderDestinationName(own) : (addr ? addr.name : ""),
    contents: $("lgContents").value.trim(),
    service: $("lgService").value,
    consignment_no: $("lgUntracked").checked ? UNTRACKED : $("lgCn").value.trim(),
    booked_on: $("lgDate").value || null,
    cost: amount.value === "" ? null : Number(amount.value),
    ...(amount.value === "" ? {} : {cost_currency:$("lgCurrency").value}),
    status: $("lgStatus").value
  };
  if(!pendingShipment && !rec.recipient){ say("Pick who it went to."); return; }
  $("addLog").disabled = true;
  $("cancelShipment").disabled = true;
  $("shipmentFields").disabled = true;
  try{
    if(online){
      if(!pendingShipment) setPendingShipment({selected, row:{...rec, id:prepared?.id || crypto.randomUUID()}});
      const saved = await saveServerShipment(pendingShipment.row);
      if(session?.user_id !== owner) return;
      shipments = [saved, ...shipments.filter(s => s.id !== saved.id)];
      setPendingShipment(null);
    }else{
      const row = {...rec, id:prepared?.id || deviceId()};
      await saveDeviceShipments(rows => rows.some(s => s.id === row.id) ? rows : [row, ...rows]);
    }
    $("lgUntracked").checked = false; $("lgCn").disabled = false; $("lgCn").value = ""; $("lgContents").value = ""; $("lgCost").value = "";
    if(prepared){
      preparedParcels = preparedParcels.filter(parcel => parcel.id !== prepared.id);
      storePrepared();
      if(!preparedParcels.length) preparedLabel = null;
      updateRecordAction();
    }
    closeShipmentEntry();
    renderLog(); say("Shipment recorded.");
  }catch(e){
    if(session?.user_id !== owner) return;
    if(e.status === 400 || e.status === 422) setPendingShipment(null);
    $("shipmentEntry").open = true;
    say((pendingShipment ? "Save unconfirmed. Tap Retry save. " : "Shipment save failed. ") + e.message);
  }finally{
    $("addLog").disabled = !canWrite();
    $("cancelShipment").disabled = false;
    $("shipmentFields").disabled = !!pendingShipment;
  }
};

/* ---------- cost estimate ---------- */
/* Indicative retail counter rates, mid-2026, pre-GST: [first 500 g, each extra 500 g] per zone.
   Grounded in published tariffs (Speed Post ~₹35–80 local / ₹130–140 >2000 km per kg; India Post
   Parcel retail ₹36 + ₹16/500 g; private couriers ₹50–90 per 500 g) — estimates, not quotes. */
const RATES = [
  ["Speed Post",       {local:[30,10],  state:[60,30],  nat:[90,50]},   "1–4 days"],
  ["Parcel (surface)", {local:[36,16],  state:[36,16],  nat:[36,16]},   "4–8 days"],
  ["DTDC",             {local:[60,40],  state:[80,50],  nat:[110,60]},  "2–5 days"],
  ["Delhivery",        {local:[55,40],  state:[75,50],  nat:[95,65]},   "2–5 days"],
  ["Blue Dart (air)",  {local:[110,70], state:[160,100],nat:[260,150]}, "1–2 days"]
];
/* Speed Post EMS abroad: [first 250 g, each extra 250 g] */
const EMS = { "Japan":[950,120], "United States":[1820,150], "United Kingdom":[1965,160],
              "Singapore":[900,110], "Australia":[1400,140], "United Arab Emirates":[950,110] };
const norm = s => String(s || "").trim().toLowerCase();
function zoneFor(a){
  const f = activeSender();
  if(norm(a.country || "India") !== "india") return "intl";
  if(norm(a.city)  && norm(a.city)  === norm(f.city))  return "local";
  if(norm(a.state) && norm(a.state) === norm(f.state)) return "state";
  return "nat";
}
const round5 = n => Math.round(n / 5) * 5;
const money = n => "₹" + round5(n * 0.9) + "–" + round5(n * 1.25);
function domesticEst(r, zone, w){
  const [first, extra] = r[zone];
  return (first + Math.max(0, Math.ceil((w - 0.5) / 0.5)) * extra) * 1.18;
}
function intlEst(country, w){
  const r = EMS[country];
  return r ? r[0] + (Math.max(1, Math.ceil(w / 0.25)) - 1) * r[1] : null;
}
const estimateServices = {"Parcel (surface)":"India Post Parcel (surface)", "Blue Dart (air)":"Blue Dart"};
let estimateOptions = [];
function estimateCell(amount, destination, name, best){
  const cost = round5(amount);
  const index = estimateOptions.push({
    key:senders.includes(destination) ? "sender:" + destination.id : destination.id,
    service:estimateServices[name] || name, cost
  }) - 1;
  const action = canWrite() ? `<br><button type="button" class="btn ghost small" data-estimate="${index}">Use ₹${cost} estimate</button>` : "";
  return `<td class="${amount === best ? "best" : ""}">${money(amount)}${action}</td>`;
}
$("costOut").addEventListener("click", event => {
  const index = event.target.dataset.estimate;
  const option = index === undefined ? null : estimateOptions[index];
  if(!option || !canWrite()) return;
  if(pendingShipment || $("addLog").disabled || $("shipmentEntry").open || $("lgCost").value || $("lgCn").value || $("lgContents").value){
    showTab("history"); $("shipmentEntry").open = true;
    say("Finish or cancel the current shipment before choosing an estimate."); return;
  }
  invalidateChangedLabel();
  const parcel = preparedParcels.find(p => p.key === option.key);
  recordingPrepared = !!parcel;
  autoFilledDestination = null;
  startBooking();
  fillLogPicker();
  $("lgTo").value = option.key;
  const service = $("lgService");
  if(!Array.from(service.options).some(item => item.value === option.service)) service.add(new Option(option.service,option.service));
  service.value = option.service;
  $("lgCurrency").value = "INR";
  $("lgCost").value = String(option.cost);
  $("lgContents").value = parcel?.contents ?? $("contents").value;
  showTab("history"); $("shipmentEntry").open = true;
  say("Estimate copied. Confirm the postage paid before saving.");
  $("lgCost").focus();
});
function renderCosts(){
  estimateOptions = [];
  const out = $("costOut"); if(!out) return;
  const f = activeSender(), chosen = recipients();
  if(!activeSenderId || !chosen.length){
    out.innerHTML = '<p class="empty">Pick a From address and tick at least one recipient above to compare courier costs.</p>'; return;
  }
  if(norm(f.country || "India") !== "india"){
    out.innerHTML = '<p class="empty">Estimates cover parcels booked in India — your From address is in ' + esc(f.country) + '. Use the local post or courier calculator there.</p>'; return;
  }
  const w = Math.max(0.5, parseFloat($("estWeight").value) || 1);
  const zones = chosen.map(zoneFor);
  const zName = { local:"Local", state:"Within state", nat:"Rest of India", intl:"International" };
  const best = chosen.map(() => Infinity);
  const cells = RATES.map(([,r]) => chosen.map((a,i) => {
    if(zones[i] === "intl") return null;
    const c = domesticEst(r, zones[i], w);
    if(c < best[i]) best[i] = c;
    return c;
  }));
  const anyIntl = zones.includes("intl");
  const emsCells = anyIntl ? chosen.map((a,i) => zones[i] === "intl" ? intlEst(a.country, w) : null) : null;
  if(emsCells) emsCells.forEach((c,i) => { if(c != null && c < best[i]) best[i] = c; });
  const head = "<tr><th>Service</th>" + chosen.map((a,i) =>
    `<th>${esc(a.label || a.name)}<br><span style="font-weight:400">${zName[zones[i]]}</span></th>`).join("") + "</tr>";
  let body = RATES.map(([name,,eta], ri) => `<tr><td>${esc(name)} <span class="eta">${eta}</span></td>` +
    cells[ri].map((c,i) => c == null ? '<td class="na">—</td>'
      : estimateCell(c, chosen[i], name, best[i])).join("") + "</tr>").join("");
  if(anyIntl) body += '<tr><td>Speed Post EMS <span class="eta">4–9 days</span></td>' +
    emsCells.map((c,i) => zones[i] !== "intl" ? '<td class="na">—</td>'
      : c == null ? '<td class="na">ask at counter</td>'
      : estimateCell(c, chosen[i], "Speed Post EMS", best[i])).join("") + "</tr>";
  out.innerHTML = `<table class="log"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
$("estWeight").addEventListener("input", renderCosts);


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
  const t = e.target.closest("[data-tab]"); if(t) showTab(t.getAttribute("data-tab"));
});

$("lgDate").value = new Date().toISOString().slice(0,10);

/* ---------- local fallback (Claude sandbox → window.storage, hosted → localStorage) ---------- */
const LKEY = "parcel-label-data";
const local = {
  async get(){
    try{ if(window.storage){ const r = await window.storage.get(LKEY); return r? JSON.parse(r.value):null; } }catch(e){}
    try{ const v = localStorage.getItem(LKEY); return v? JSON.parse(v):null; }catch(e){}
    return null;
  },
  async set(d){
    try{ if(window.storage){ await window.storage.set(LKEY, JSON.stringify(d)); return; } }catch(e){}
    try{ localStorage.setItem(LKEY, JSON.stringify(d)); }catch(e){}
  }
};
const snapshot = () => ({ senders, activeSenderId, addresses, shipments });

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
  $("appMain").style.display = v ? "" : "none";
  document.querySelector(".top").style.display = v ? "" : "none";
  $("authCard").style.display = v ? "none" : "";
  document.querySelector(".bar").style.display =
    v && $("tabLabels").style.display !== "none" ? "" : "none";
  $("signOut").style.display = session ? "inline-block" : "none";
  $("acctEmail").textContent = session ? (session.email || "signed in") : "Not signed in";
}

async function boot(){
  const s = await ensureSession();
  if(!s){
    let reachable = true;
    try{ await fetch(AUTH + "health", { headers:{ apikey: SUPABASE_KEY } }); }catch(e){ reachable = false; }
    if(reachable){
      setConn("off", "Signed out");
      showApp(false);
    }else{
      online = false;
      setConn("off", location.protocol === "file:"
        ? "Offline — open via http://localhost, not the file itself"
        : "Offline — device only, nothing is syncing");
      showApp(true);
      await loadAll();
    }
    return;
  }
  try{
    await rest("tapal_settings?select=id&limit=1");
    online = true;
    role = await rest("rpc/tapal_my_role", { method:"POST", body:"{}" });
    if(!role){
      await doSignOut(false);
      $("authStatus").textContent = "That email isn't on the access list. Ask an admin to add it, then sign in again.";
      return;
    }
    setConn("live", "Synced — " + (session.email || "signed in") + " · " + role);
  }catch(e){
    if(e.status === 401 || e.status === 403){ doSignOut(true); return; }
    online = false;
    console.error("Supabase unreachable:", e);
    setConn("off", "Offline — " + String(e.message || e).slice(0,80));
  }
  showApp(true);
  applyRole();
  await loadAll();
}

/* Viewers can browse, select and print, but not change anything. */
function applyRole(){
  const ro = !canWrite();
  ["showSender","saveSender","showAdd","saveAddr","addLog"].forEach(i => { $(i).disabled = ro; });
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
  saveSession(null);
  role = null;
  senders = []; activeSenderId = null; addresses = []; shipments = [];
  showTab("labels");
  showApp(false);
  setConn("off", "Signed out");
  $("authStatus").textContent = expired ? "Session expired — sign in again." : "";
}
$("signOut").onclick = () => doSignOut(false);

async function loadAll(){
  if(online){
    const [s,a,l] = await Promise.all([
      rest("tapal_senders?user_id=eq." + session.user_id + "&select=*&order=created_at"),
      rest("tapal_addresses?archived=eq.false&select=*&order=name"),
      rest("tapal_shipments?select=*&order=booked_on.desc.nullslast&limit=50")
    ]);
    senders = (s || []).map(x => ({ id:x.id, name:x.name, phone:x.phone, addr:x.line, city:x.city, district:x.district || "", state:x.state || "", pin:x.pin, country:x.country || "India", label:x.label || "" }));
    addresses = (a || []).map(x => ({...x, addr:x.line}));
    shipments = l || [];
  }else{
    const d = await local.get() || {};
    /* old single-sender snapshots migrate into a one-item list */
    senders = d.senders || (d.sender && (d.sender.name || d.sender.addr) ? [{ id:"s1", ...d.sender }] : []);
    activeSenderId = d.activeSenderId || null;
    addresses = d.addresses || []; shipments = d.shipments || [];
  }
  try{ activeSenderId = localStorage.getItem(AKEY) || activeSenderId; }catch(e){}
  if(!senders.some(x => x.id === activeSenderId)) activeSenderId = senders[0] ? senders[0].id : null;
  addresses.forEach(a => { if(!(a.id in ui)) ui[a.id] = { sel:true, copies:1, fragile:false }; });
  renderSenders(); render(); renderLog(); fillLogPicker(); renderCosts();
}

/* ---------- senders (From blocks) ---------- */
function renderSenders(){
  const el = $("senderList");
  senders.forEach(s => { if(!(s.id in sui)) sui[s.id] = { sel:false, copies:1, fragile:false }; });
  if(!senders.length){ el.innerHTML = '<p class="empty">No sender saved yet — add one below.</p>'; renderCosts(); return; }
  el.innerHTML = senders.map(s => {
    const isFrom = s.id === activeSenderId, u = sui[s.id];
    return `<div class="entry ${isFrom ? "on" : ""} ${!isFrom && u.fragile ? "frag" : ""}">
      <label class="pick"><input type="radio" name="senderPick" data-sender="${s.id}" ${isFrom ? "checked" : ""}>From</label>
      <div class="body"><div class="who">${esc(s.label || s.name || "(unnamed)")}${
        s.country && s.country !== "India" ? `<span class="flag">${esc(s.country)}</span>` : ""}</div>
        <div class="addr">${esc(addrLines(s, { name:!!s.label, phone:true }).join("\n"))}</div></div>
      <div class="acts">
        <label class="pick"><input type="checkbox" data-srecv="${s.id}" ${u.sel ? "checked" : ""} ${isFrom ? "disabled" : ""}>Send here</label>
        ${!isFrom && u.sel ? `<input class="copies" type="number" min="1" max="20" value="${u.copies}" data-scopies="${s.id}" aria-label="Copies">
        <label class="pick"><input type="checkbox" data-sfrag="${s.id}" ${u.fragile ? "checked" : ""}>Fragile</label>` : ""}
        ${canWrite() ? `<button class="btn ghost small" data-sedit="${s.id}">Edit</button>
        ${senders.length > 1 ? `<button class="btn danger small" data-sdel="${s.id}">Delete</button>` : ""}` : ""}
      </div></div>`;
  }).join("");
  renderCosts();
}
$("senderList").addEventListener("change", e => {
  const t = e.target;
  const id = t.getAttribute("data-sender");
  if(id){
    activeSenderId = id;
    if(sui[id]) sui[id].sel = false;          // can't post a parcel to itself
    try{ localStorage.setItem(AKEY, id); }catch(_){}
    renderSenders(); $("senderStatus").textContent = "";
    return;
  }
  const r = t.getAttribute("data-srecv"); if(r){ sui[r].sel = t.checked; renderSenders(); return; }
  const g = t.getAttribute("data-sfrag"); if(g){ sui[g].fragile = t.checked; renderSenders(); return; }
  const c = t.getAttribute("data-scopies");
  if(c) sui[c].copies = Math.max(1, Math.min(20, parseInt(t.value,10) || 1));
});
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
  const el = $("list");
  if(!addresses.length){ el.innerHTML = '<p class="empty">No addresses saved yet.</p>'; renderCosts(); return; }
  el.innerHTML = addresses.map(a => {
    const u = ui[a.id] || {sel:true,copies:1,fragile:false};
    return `<div class="entry ${u.sel?"on":""} ${u.fragile?"frag":""}">
      <input type="checkbox" data-sel="${a.id}" ${u.sel?"checked":""} aria-label="Print for ${esc(a.name)}">
      <div class="body"><div class="who">${esc(a.label || a.name)}${
        a.country && a.country !== "India" ? `<span class="flag">${esc(a.country)}</span>` : ""}</div>
        <div class="addr">${esc(addrLines(a, { name:!!a.label, phone:true }).join("\n"))}</div></div>
      <div class="acts">
        <input class="copies" type="number" min="1" max="20" value="${u.copies}" data-copies="${a.id}" aria-label="Copies">
        <label class="pick"><input type="checkbox" data-frag="${a.id}" ${u.fragile?"checked":""}>Fragile</label>
        ${canWrite() ? `<button class="btn ghost small" data-edit="${a.id}">Edit</button>
        <button class="btn danger small" data-del="${a.id}">Delete</button>` : ""}
      </div></div>`;
  }).join("");
  renderCosts();
}

$("list").addEventListener("change", e => {
  const t = e.target;
  const s = t.getAttribute("data-sel"); if(s){ ui[s].sel = t.checked; render(); }
  const g = t.getAttribute("data-frag"); if(g){ ui[g].fragile = t.checked; render(); }
  const c = t.getAttribute("data-copies"); if(c){ ui[c].copies = Math.max(1,Math.min(20,parseInt(t.value,10)||1)); }
});
$("list").addEventListener("click", async e => {
  const ed = e.target.getAttribute("data-edit"); if(ed){ startEdit(ed); return; }
  const dl = e.target.getAttribute("data-del");
  if(dl){
    if(!confirm("Delete this address?")) return;
    try{
      if(online) await rest("tapal_addresses?id=eq." + dl, { method:"PATCH", headers:RETURN, body:JSON.stringify({archived:true}) });
      addresses = addresses.filter(a => a.id !== dl);
      if(!online) await local.set(snapshot());
      render(); fillLogPicker(); say("Address deleted.");
    }catch(e){ say("Delete failed: " + e.message); }
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

$("saveAddr").onclick = async () => {
  const v = readForm("r");
  if(!v.name){ say("Add a recipient name first."); return; }
  const perr = postalError(v); if(perr){ say(perr); return; }
  const rec = toRec(v);

  if(online){
    let row;
    try{
      const out = editingId
        ? await rest("tapal_addresses?id=eq." + editingId, { method:"PATCH", headers:RETURN, body:JSON.stringify(rec) })
        : await rest("tapal_addresses", { method:"POST", headers:RETURN, body:JSON.stringify(rec) });
      row = { ...out[0], addr: out[0].line };
    }catch(e){ say("Save failed: " + e.message); return; }
    if(!(row.id in ui)) ui[row.id] = { sel:true, copies:1 };
    addresses = editingId ? addresses.map(a => a.id===editingId?row:a) : [...addresses,row];
    addresses.sort((x,y) => (x.name||"").localeCompare(y.name||""));
  }else{
    const id = editingId || "a"+Date.now();
    const row = {...rec, id, addr:rec.line};
    if(!(id in ui)) ui[id] = { sel:true, copies:1 };
    addresses = editingId ? addresses.map(a => a.id===id?row:a) : [...addresses,row];
    await local.set(snapshot());
  }
  closeAddrModal();
  render(); fillLogPicker(); say("Saved.");
};

async function persistSender(){
  const note = m => { $("senderStatus").textContent = m; };
  const v = readForm("s");
  if(!v.name){ note("Add a sender name first."); return; }
  /* Each country validates its own postal format (a sender's is optional even in India). */
  if(v.pin){ const perr = postalError(v); if(perr){ note(perr); return; } }
  const r0 = toRec(v);
  const rec = { label:r0.label || "", name:r0.name, phone:r0.phone, addr:r0.line, city:r0.city, district:r0.district || "", state:r0.state || "", pin:r0.pin || "", country:r0.country };
  const id = editingSenderId;
  note("Saving…");
  if(online){
    try{
      const body = JSON.stringify({ label:rec.label || null, name:rec.name, phone:rec.phone, line:rec.addr, city:rec.city, district:rec.district || null, state:rec.state || null, pin:rec.pin || null, country:rec.country });
      if(id){
        await rest("tapal_senders?id=eq." + id, { method:"PATCH", headers:RETURN, body });
        senders = senders.map(s => s.id === id ? { ...s, ...rec } : s);
      }else{
        const out = await rest("tapal_senders", { method:"POST", headers:RETURN, body });
        const r = out[0];
        senders.push({ id:r.id, label:r.label || "", name:r.name, phone:r.phone, addr:r.line, city:r.city, district:r.district || "", state:r.state || "", pin:r.pin, country:r.country || "India" });
        activeSenderId = r.id;
      }
      note(id ? "Sender updated." : "Sender saved.");
    }catch(e){ note("Save failed: " + e.message); return; }
  }else{
    if(id) senders = senders.map(s => s.id === id ? { ...s, ...rec } : s);
    else { const nid = "s" + Date.now(); senders.push({ id:nid, ...rec }); activeSenderId = nid; }
    await local.set(snapshot());
    note("Saved on this device only — not synced. " + (location.protocol === "file:"
      ? "Opening the file directly blocks Supabase; serve it over http://localhost instead."
      : "Check the connection badge at the top."));
  }
  try{ localStorage.setItem(AKEY, activeSenderId); }catch(_){}
  editingSenderId = null;
  closeModal("senderModal");
  renderSenders();
}
$("saveSender").onclick = () => persistSender();

async function deleteSender(id){
  if(senders.length < 2) return;
  const note = m => { $("senderStatus").textContent = m; };
  if(!confirm("Delete this sender?")) return;
  if(online){
    try{ await rest("tapal_senders?id=eq." + id, { method:"DELETE" }); }
    catch(e){ note("Delete failed: " + e.message); return; }
  }
  senders = senders.filter(s => s.id !== id);
  delete sui[id];
  if(activeSenderId === id) activeSenderId = senders[0] ? senders[0].id : null;
  if(!online) await local.set(snapshot());
  try{ if(activeSenderId) localStorage.setItem(AKEY, activeSenderId); }catch(_){}
  renderSenders(); note("Sender deleted.");
}
$("selAll").onclick  = () => { addresses.forEach(a => ui[a.id].sel = true);  render(); };
$("selNone").onclick = () => { addresses.forEach(a => ui[a.id].sel = false); render(); };
/* Master fragile toggle — sets every address at once; rows stay individually editable. */
$("optFragile").onchange = e => {
  addresses.forEach(a => ui[a.id].fragile = e.target.checked);
  senders.forEach(s => { if(sui[s.id]) sui[s.id].fragile = e.target.checked; });
  render(); renderSenders();
};

/* ---------- shipment log ---------- */
function fillLogPicker(){
  const sel = $("lgTo"), cur = sel.value;
  sel.innerHTML = '<option value="">Select</option>';
  addresses.forEach(a => sel.add(new Option(a.label ? `${a.name} — ${a.label}` : a.name, a.id)));
  sel.value = cur;
}
function renderLog(){
  const b = $("logBody");
  if(!shipments.length){ b.innerHTML = '<tr><td colspan="6" class="empty">Nothing logged yet.</td></tr>'; return; }
  b.innerHTML = shipments.map(s => `<tr>
    <td>${esc(s.booked_on||"")}</td>
    <td>${esc(s.recipient||"")}</td>
    <td>${esc(s.service||"")}</td>
    <td class="cn">${esc(s.consignment_no||"—")}</td>
    <td><span class="pill">${esc(s.status||"")}</span></td>
    <td>${canWrite() ? `<button class="btn danger small" data-dellog="${s.id}">Remove</button>` : ""}</td></tr>`).join("");
}
$("logBody").addEventListener("click", async e => {
  const id = e.target.getAttribute("data-dellog"); if(!id) return;
  if(online) { try{ await rest("tapal_shipments?id=eq." + id, { method:"DELETE" }); }catch(e){ say("Delete failed: " + e.message); return; } }
  shipments = shipments.filter(s => s.id !== id);
  if(!online) await local.set(snapshot());
  renderLog();
});
$("addLog").onclick = async () => {
  const addr = addresses.find(a => a.id === $("lgTo").value);
  const rec = {
    address_id: online && addr ? addr.id : null,
    recipient: addr ? addr.name : "",
    contents: $("lgContents").value.trim(),
    service: $("lgService").value,
    consignment_no: $("lgCn").value.trim(),
    booked_on: $("lgDate").value || null,
    cost: $("lgCost").value ? Number($("lgCost").value) : null,
    status: $("lgStatus").value
  };
  if(!rec.recipient){ say("Pick who it went to."); return; }
  if(online){
    try{
      const out = await rest("tapal_shipments", { method:"POST", headers:RETURN, body:JSON.stringify(rec) });
      shipments = [out[0], ...shipments];
    }catch(e){ say("Log failed: " + e.message); return; }
  }else{
    shipments = [{...rec, id:"s"+Date.now()}, ...shipments];
    await local.set(snapshot());
  }
  $("lgCn").value = ""; $("lgContents").value = ""; $("lgCost").value = "";
  renderLog(); say("Logged.");
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
function renderCosts(){
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
      : `<td class="${c === best[i] ? "best" : ""}">${money(c)}</td>`).join("") + "</tr>").join("");
  if(anyIntl) body += '<tr><td>Speed Post EMS <span class="eta">4–9 days</span></td>' +
    emsCells.map((c,i) => zones[i] !== "intl" ? '<td class="na">—</td>'
      : c == null ? '<td class="na">ask at counter</td>'
      : `<td class="${c === best[i] ? "best" : ""}">${money(c)}</td>`).join("") + "</tr>";
  out.innerHTML = `<table class="log"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
$("estWeight").addEventListener("input", renderCosts);


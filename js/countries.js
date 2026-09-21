/* Parcel labels — country address formats + form builder
   Loaded in order from index.html; plain scripts sharing one global scope. */
/* ---------- country address formats ----------
   Each country gets its own field order, labels, postal-code rule and printed
   line order (Amazon-style). Fields map onto the same columns everywhere:
   line = l1 \n l2 \n l3, plus city / district / state / pin / country. */
const JP_PREFS = [["Hokkaido","北海道"],["Aomori-ken","青森県"],["Iwate-ken","岩手県"],["Miyagi-ken","宮城県"],["Akita-ken","秋田県"],["Yamagata-ken","山形県"],["Fukushima-ken","福島県"],["Ibaraki-ken","茨城県"],["Tochigi-ken","栃木県"],["Gunma-ken","群馬県"],["Saitama-ken","埼玉県"],["Chiba-ken","千葉県"],["Tokyo-to","東京都"],["Kanagawa-ken","神奈川県"],["Niigata-ken","新潟県"],["Toyama-ken","富山県"],["Ishikawa-ken","石川県"],["Fukui-ken","福井県"],["Yamanashi-ken","山梨県"],["Nagano-ken","長野県"],["Gifu-ken","岐阜県"],["Shizuoka-ken","静岡県"],["Aichi-ken","愛知県"],["Mie-ken","三重県"],["Shiga-ken","滋賀県"],["Kyoto-fu","京都府"],["Osaka-fu","大阪府"],["Hyogo-ken","兵庫県"],["Nara-ken","奈良県"],["Wakayama-ken","和歌山県"],["Tottori-ken","鳥取県"],["Shimane-ken","島根県"],["Okayama-ken","岡山県"],["Hiroshima-ken","広島県"],["Yamaguchi-ken","山口県"],["Tokushima-ken","徳島県"],["Kagawa-ken","香川県"],["Ehime-ken","愛媛県"],["Kochi-ken","高知県"],["Fukuoka-ken","福岡県"],["Saga-ken","佐賀県"],["Nagasaki-ken","長崎県"],["Kumamoto-ken","熊本県"],["Oita-ken","大分県"],["Miyazaki-ken","宮崎県"],["Kagoshima-ken","鹿児島県"],["Okinawa-ken","沖縄県"]];
const US_STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","District of Columbia","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];
const AU_STATES = ["New South Wales","Victoria","Queensland","Western Australia","South Australia","Tasmania","Australian Capital Territory","Northern Territory"];
const AE_EMIRATES = ["Abu Dhabi","Dubai","Sharjah","Ajman","Umm Al Quwain","Ras Al Khaimah","Fujairah"];
const J = (...xs) => xs.filter(Boolean).join(", ");
const FORMATS = {
  "India": { dial:"+91",
    postal:{ label:"PIN code", numeric:true, max:6, re:/^\d{6}$/, eg:"560068", required:true, lookup:"in", hint:"6 digits — town, district and state fill in for you" },
    fields:["pin", {k:"l1",label:"Flat, house no., building, company, apartment"}, {k:"l2",label:"Area, street, sector, village"},
            {k:"l3",label:"Landmark (optional)",ph:"e.g. Near Kudlu Gate metro station"}, {k:"city",label:"Town / city"},
            {k:"district",label:"District"}, {k:"state",label:"State",options:STATES}],
    lines:a => [a.l1, a.l2, a.l3, J(a.city, a.district), [a.state, a.pin].filter(Boolean).join(" - ")] },
  "Japan": { dial:"+81",
    postal:{ label:"Postal code 〒", numeric:true, split:[3,4], re:/^\d{3}-\d{4}$/, eg:"272-0001", lookup:"jp", hint:"7 digits — prefecture, city and town fill in for you" },
    fields:["pin", {k:"state",label:"Prefecture",options:JP_PREFS.map(p => [p[0], p[0] + " · " + p[1]])},
            {k:"city",label:"City, ward, town (市区町村)",ph:"e.g. 市川市 二俣"}, {k:"l1",label:"Chome, banchi, go (丁目・番地・号)",ph:"e.g. 1-1-22"},
            {k:"l2",label:"Building / apartment / company",ph:"e.g. 東京シェア市川",pair:{k:"l3",label:"Room no.",ph:"206"}}],
    lines:a => [a.pin ? "〒 " + a.pin : "", J(a.state, a.city), a.l1, [a.l2, a.l3].filter(Boolean).join(" ")] },
  "United States": { dial:"+1",
    postal:{ label:"ZIP code", re:/^\d{5}(-\d{4})?$/, eg:"94103 or 94103-1234", max:10 },
    fields:[{k:"l1",label:"Street address"}, {k:"l2",label:"Apt, suite, unit, building (optional)"}, {k:"city",label:"City"},
            {k:"state",label:"State",options:US_STATES}, "pin"],
    lines:a => [a.l1, a.l2, [J(a.city, a.state), a.pin].filter(Boolean).join(" ")] },
  "United Kingdom": { dial:"+44",
    postal:{ label:"Postcode", upper:true, re:/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/, eg:"SW1A 1AA", max:8 },
    fields:[{k:"l1",label:"Address line 1",ph:"House number and street"}, {k:"l2",label:"Address line 2 (optional)"},
            {k:"city",label:"Town / city"}, {k:"district",label:"County (optional)"}, "pin"],
    lines:a => [a.l1, a.l2, a.city, a.district, a.pin] },
  "Singapore": { dial:"+65",
    postal:{ label:"Postal code", numeric:true, max:6, re:/^\d{6}$/, eg:"018956" },
    fields:[{k:"l1",label:"Block / house no. and street",ph:"e.g. Blk 123 Ang Mo Kio Ave 3"}, {k:"l2",label:"Unit no. and building (optional)",ph:"e.g. #12-34 Sunrise Tower"}, "pin"],
    lines:a => [a.l1, a.l2, ["Singapore", a.pin].filter(Boolean).join(" ")] },
  "Australia": { dial:"+61",
    postal:{ label:"Postcode", numeric:true, max:4, re:/^\d{4}$/, eg:"2000" },
    fields:[{k:"l1",label:"Street address"}, {k:"l2",label:"Unit / apartment (optional)"}, {k:"city",label:"Suburb"},
            {k:"state",label:"State / territory",options:AU_STATES}, "pin"],
    lines:a => [a.l1, a.l2, [a.city, a.state, a.pin].filter(Boolean).join(" ")] },
  "United Arab Emirates": { dial:"+971",
    postal:{ label:"PO box (optional)", max:12 },
    fields:[{k:"l1",label:"Villa / building name and number"}, {k:"l2",label:"Street / area"}, {k:"city",label:"City"},
            {k:"state",label:"Emirate",options:AE_EMIRATES}, "pin"],
    lines:a => [a.l1, a.l2, J(a.city, a.state), a.pin ? "PO Box " + a.pin : ""] },
  "Other": { dial:"",
    postal:{ label:"Postal code", max:12 },
    fields:[{k:"l1",label:"Address line 1"}, {k:"l2",label:"Address line 2 (optional)"}, {k:"city",label:"City"},
            {k:"state",label:"State / province / region"}, "pin"],
    lines:a => [a.l1, a.l2, [J(a.city, a.state), a.pin].filter(Boolean).join(" ")] }
};
const fmtOf = c => FORMATS[c] || FORMATS.Other;

/* Printed / displayed address lines for a saved record, in that country's order. */
function addrLines(a, o = {}){
  const [l1, l2, l3] = splitLine(a.addr || a.line);
  const c = a.country || "India";
  const L = fmtOf(c).lines({ ...a, l1, l2, l3 }).filter(Boolean);
  if(o.name && a.name) L.unshift(a.name);
  if(o.country) L.push(c.toUpperCase());
  if(o.phone && a.phone) L.push("Ph: " + a.phone);
  return L;
}

/* Build the sender (p="s") or recipient (p="r") form for a country, keeping typed values. */
function buildForm(p, country, v = {}){
  const F = fmtOf(country), id = k => p + "_" + k;
  const attr = (n, val) => val ? ` ${n}="${esc(val)}"` : "";
  const inp = (k, o = {}) => `<input type="text" id="${id(k)}" value="${esc(v[k] || "")}"${attr("placeholder", o.ph)}${o.numeric ? ' inputmode="numeric"' : ""}${attr("maxlength", o.max)}${attr("class", o.cls)}>`;
  const sel = (k, opts) => `<select id="${id(k)}"><option value="">Select</option>${opts.map(x => { const [val, txt] = Array.isArray(x) ? x : [x, x];
    return `<option value="${esc(val)}"${val === v[k] ? " selected" : ""}>${esc(txt)}</option>`; }).join("")}</select>`;
  const fld = (k, label, inner, hint) => `<div class="fl"><label for="${id(k)}">${esc(label)}</label>${inner}${hint ? `<div class="fh">${esc(hint)}</div>` : ""}</div>`;
  const ctl = f => f.options ? sel(f.k, f.options) : inp(f.k, f);
  let h = fld("country", "Country / region", `<select id="${id("country")}">${Object.keys(FORMATS).map(c => `<option${c === country ? " selected" : ""}>${c}</option>`).join("")}</select>`);
  h += fld("name", "Full name", inp("name"));
  h += fld("phone", "Phone number", `<div class="phoneRow"><select id="${id("code")}" aria-label="Country code"><option value="">Code</option>${
    DIAL.map(([c, n]) => `<option value="${c}"${c === (v.code || F.dial) ? " selected" : ""}>${c} ${n}</option>`).join("")}</select><input type="tel" id="${id("phone")}" value="${esc(v.phone || "")}"></div>`, "Printed on the label so the courier can call");
  F.fields.forEach(f => {
    if(f === "pin"){
      const P = F.postal;
      if(P.split){
        const [a, b] = String(v.pin || "").split("-");
        h += fld("pin", P.label, `<div class="zip"><input type="text" id="${id("pin")}" class="pin z3" inputmode="numeric" maxlength="${P.split[0]}" value="${esc(a || "")}"><span>-</span><input type="text" id="${id("pin2")}" class="pin" inputmode="numeric" maxlength="${P.split[1]}" value="${esc(b || "")}" aria-label="${esc(P.label)} part 2"></div>`, P.hint);
      }else h += fld("pin", P.label, inp("pin", { numeric:P.numeric, max:P.max, cls:"pin", ph:P.eg ? "e.g. " + P.eg : "" }), P.hint);
      return;
    }
    h += f.pair ? `<div class="pair">${fld(f.k, f.label, ctl(f))}${fld(f.pair.k, f.pair.label, ctl(f.pair))}</div>` : fld(f.k, f.label, ctl(f), f.hint);
  });
  h += fld("label", "Address title (optional)", inp("label", { ph: p === "s" ? "e.g. Tokyo flat · Madurai home" : "e.g. Meena — office" }), "Short name shown in your list");
  $(p + "Form").innerHTML = h;
  $(id("country")).onchange = () => { const cur = readForm(p); cur.code = fmtOf(cur.country).dial || cur.code; buildForm(p, cur.country, cur); };
}
function readForm(p){
  const g = k => { const e = $(p + "_" + k); return e ? e.value.trim() : ""; };
  const country = g("country") || "India", P = fmtOf(country).postal;
  let pin = g("pin");
  if(P.split){ const b = g("pin2"); pin = (pin || b) ? pin.replace(/\D/g, "") + "-" + b.replace(/\D/g, "") : ""; }
  else if(P.numeric) pin = pin.replace(/\D/g, "");
  if(P.upper) pin = pin.toUpperCase().replace(/\s+/g, " ");
  return { country, label:g("label"), name:g("name"), code:g("code"), phone:g("phone"), pin,
           l1:g("l1"), l2:g("l2"), l3:g("l3"), city:g("city"), district:g("district"), state:g("state") };
}
function postalError(v){
  const P = fmtOf(v.country).postal;
  if(!v.pin) return P.required ? P.label + " is required." : null;
  if(P.re && !P.re.test(v.pin)) return P.label + " should look like " + P.eg + ".";
  return null;
}
/* Form values ↔ stored record */
const recVals = a => { const [code, phone] = splitPhone(a.phone), [l1, l2, l3] = splitLine(a.addr || a.line);
  return { label:a.label, name:a.name, code, phone, l1, l2, l3, city:a.city, district:a.district, state:a.state, pin:a.pin }; };
const toRec = v => ({ label:v.label || null, name:v.name, phone:joinPhone(v.code, v.phone),
  line:[v.l1, v.l2, v.l3].join("\n").replace(/\n+$/, ""), city:v.city, district:v.district || null, state:v.state || null, pin:v.pin || null, country:v.country });

/* Postal-code lookups: India Post (api.postalpincode.in) and Japan Post via zipcloud.
   Both free, no key; silent when offline. Only fills fields still empty. */
let pinTimer;
async function lookupIN(pin, p, note){
  note("Looking up PIN " + pin + "…");
  try{
    const d = await (await fetch("https://api.postalpincode.in/pincode/" + pin)).json();
    const po = d && d[0] && d[0].Status === "Success" ? d[0].PostOffice : null;
    if(!po || !po.length){ note("PIN " + pin + " not found — fill the fields yourself."); return; }
    const o = po[0], set = (k, val) => { const e = $(p + "_" + k); if(e && !e.value && val) e.value = val; };
    set("district", o.District); set("state", o.State);
    set("city", o.Block && o.Block !== "NA" ? o.Block : o.District);
    note("PIN " + pin + ": " + J(o.District, o.State) + ".");
  }catch(e){ note("Couldn't reach the PIN lookup — fill the fields yourself."); }
}
async function lookupJP(zip, p, note){
  note("Looking up 〒" + zip + "…");
  try{
    const d = await (await fetch("https://zipcloud.ibsnet.co.jp/api/search?zipcode=" + zip)).json();
    const r = d && d.results && d.results[0];
    if(!r){ note("〒" + zip + " not found — fill the fields yourself."); return; }
    const pref = JP_PREFS.find(x => x[1] === r.address1), set = (k, val) => { const e = $(p + "_" + k); if(e && !e.value && val) e.value = val; };
    if(pref) set("state", pref[0]);
    set("city", (r.address2 || "") + (r.address3 ? " " + r.address3 : ""));
    note("〒" + zip + ": " + [r.address1, r.address2, r.address3].filter(Boolean).join(" ") + ".");
  }catch(e){ note("Couldn't reach the postal lookup — fill the fields yourself."); }
}
function wireLookup(p, noteEl){
  const note = m => { $(noteEl).textContent = m; };
  $(p + "Form").addEventListener("input", e => {
    if(!/_pin2?$/.test(e.target.id)) return;
    const v = readForm(p), L = fmtOf(v.country).postal.lookup, digits = v.pin.replace(/\D/g, "");
    clearTimeout(pinTimer); note("");
    if(L === "in" && digits.length === 6) pinTimer = setTimeout(() => lookupIN(digits, p, note), 300);
    if(L === "jp" && digits.length === 7) pinTimer = setTimeout(() => lookupJP(digits, p, note), 300);
  });
}
wireLookup("s", "senderStatus"); wireLookup("r", "rNote");
function splitPhone(p){
  p = (p || "").trim();
  const code = DIAL.map(d => d[0]).sort((a,b) => b.length - a.length).find(c => p.startsWith(c));
  return code ? [code, p.slice(code.length).trim()] : ["", p];
}
function joinPhone(code, num){ return num && code && !num.startsWith("+") ? code + " " + num : num; }
const ui = {};                 // selection + copies, kept client-side only
let editingId = null;


/* line ↔ structured fields: house \n street \n landmark */
function splitLine(addr){
  const l = String(addr || "").split("\n").map(x => x.trim());
  if(l.length <= 3) return [l[0] || "", l[1] || "", l[2] || ""];
  const f = l.filter(Boolean);
  return [f[0] || "", f.slice(1, -1).join(", "), f[f.length - 1] || ""];
}

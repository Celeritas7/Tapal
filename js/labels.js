/* Parcel labels — handling band, label sheets, print, PDF
   Loaded in order from index.html; plain scripts sharing one global scope. */
/* ---------- handling band ---------- */
/* ISO 780-style broken-glass mark. Flat black line-art so it survives a cheap
   laser printer; print-color-adjust keeps it from being dropped. */
const GLASS_SVG = '<svg viewBox="0 0 48 60" aria-hidden="true">'
  + '<path d="M9 6 H39 L26.5 31 H21.5 Z" fill="#000"/>'
  + '<path d="M22.5 31 H25.5 V50 H22.5 Z" fill="#000"/>'
  + '<path d="M13 56 H35 L30 50 H18 Z" fill="#000"/>'
  + '<path d="M27 5 H40 L31.5 22 L28.5 13 L25.5 17 Z" fill="#fff"/>'
  + '<path d="M20 8 L24 13 L20.5 17 L23.5 22" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
  + '<path d="M40 7 L47 11 L39 14 Z" fill="#000"/>'
  + '<path d="M42 19 L47.5 23 L41 25 Z" fill="#000"/></svg>';

const CARE_NOTE  = "DO NOT DROP \u00b7 DO NOT STACK \u00b7 KEEP UPRIGHT \u00b7 \u0938\u093e\u0935\u0927\u093e\u0928\u0940 \u0938\u0947 \u0930\u0916\u0947\u0902";
const CARE_MARKS = ["GLASS \u00b7 \u0915\u093e\u0901\u091a", "THIS SIDE UP \u2191", "KEEP DRY"];

function bandHTML(text, inside){
  if(!text) return "";
  if(inside) return `<div class="band"><div><div class="bt">${esc(text)}</div></div></div>`;
  return `<div class="band">${GLASS_SVG}<div>
    <div class="bt">${esc(text)}</div>
    <div class="bn">${esc(CARE_NOTE)}</div>
    <div class="bm">${CARE_MARKS.map(m => `<span>${esc(m)}</span>`).join("")}</div>
  </div></div>`;
}

/* ---------- labels ---------- */
const pinBoxes = pin => `<div class="pinBoxes">${
  String(pin||"").padEnd(6," ").slice(0,6).split("").map(d => `<span>${esc(d.trim())}</span>`).join("")}</div>`;

/* Labels print the selected sender block. */
function fromBlock(to){
  const s = activeSender();
  const abroad = (s.country || "India") !== ((to && to.country) || "India");
  return addrLines(s, { name:true, phone:true, country:abroad }).join("\n") || "(no sender selected)";
}
function labelHTML(a, inside){
  const contents = $("contents").value.trim();
  const c = a.country || "India", from = activeSender();
  const abroad = c !== (from.country || "India");
  const L = addrLines(a, { country:abroad });
  /* Japan: the 〒 line moves out of the block into the big postal row. */
  if(c === "Japan" && L[0] && L[0].startsWith("〒")) L.shift();
  const addr = L.join("\n");
  const band = inside ? "IF UNDELIVERABLE — CONTENTS SLIP"
    : (prState(a.id).fragile ? "FRAGILE — HANDLE WITH CARE" : "");
  return `<div class="label"><div class="inner">
    ${bandHTML(band, inside)}
    <div class="toLbl">To</div>
    <div class="toName">${esc(a.name)}</div>
    <div class="toAddr">${esc(addr)}</div>
    ${a.phone ? `<div class="phone">Ph: ${esc(a.phone)}</div>` : ""}
    ${c === "India"
      ? `<div class="pinRow"><span class="pl">PIN</span>${pinBoxes(a.pin)}</div>`
      : (a.pin ? `<div class="pinRow"><span class="pl">${c === "Japan" ? "〒" : "POST CODE"}</span><span class="toName postBig">${esc(a.pin)}</span></div>` : "")}
    <div class="foot"><div class="from"><div class="fromLbl">From</div>
      <div class="fromTxt">${esc(fromBlock(a))}</div></div>
      ${contents ? `<div class="contents">${esc(contents)}</div>` : ""}
    </div></div></div>`;
}
function buildSheets(cls, items){
  const per = cls === "one" ? 1 : cls === "two" ? 2 : 4;
  let out = "";
  for(let i=0; i<items.length; i+=per){
    const chunk = items.slice(i, i+per);
    while(chunk.length < per) chunk.push('<div class="label"></div>');
    out += `<div class="sheet ${cls}">${chunk.join("")}</div>`;
  }
  return out;
}
function build(){
  const chosen = recipients();
  if(!activeSenderId){ say("Pick which address you're sending from."); return false; }
  if(!chosen.length){ say("Tick at least one recipient — an address book row, or “Send here” on one of your own addresses."); return false; }
  const size = $("size").value, main = [], slips = [];
  chosen.forEach(a => {
    for(let i=0; i<(prState(a.id).copies||1); i++) main.push(labelHTML(a,false));
    if($("optInside").checked) slips.push(labelHTML(a,true));
  });
  /* One recipient, one copy — give it the whole sheet instead of a blank half. */
  const cls = main.length === 1 ? "one" : size;
  $("scalerInner").innerHTML = buildSheets(cls,main) + (slips.length ? buildSheets("four",slips) : "");
  fit();
  say(`${main.length} label${main.length>1?"s":""} ready${slips.length?`, plus ${slips.length} inside slip${slips.length>1?"s":""}`:""}.`);
  return true;
}
function fit(){
  const holder = $("scalerInner").parentNode;
  const s = Math.min(1, holder.clientWidth / 794);   // 210mm ≈ 794px @96dpi
  $("scalerInner").style.transform = `scale(${s})`;
  $("scalerInner").style.height = ($("scalerInner").scrollHeight * s) + "px";
}
window.addEventListener("resize", () => { if(document.body.classList.contains("preview")) fit(); });

$("previewBtn").onclick = () => {
  if(!build()) return;
  document.body.classList.add("preview");
  $("hideBtn").style.display = "inline-block";
  setTimeout(fit,30);
  $("sheets").scrollIntoView({behavior:"smooth"});
};
$("hideBtn").onclick = () => {
  document.body.classList.remove("preview");
  $("hideBtn").style.display = "none";
  window.scrollTo({top:0,behavior:"smooth"});
};
$("printBtn").onclick = () => { if(build()) setTimeout(() => window.print(), 60); };

/* ---------- direct PDF download ---------- */
/* Renders each A4 sheet to canvas and packs them into one PDF — no print dialog.
   Libraries load lazily from CDN on first use; offline, the print path still works. */
const loadScript = src => new Promise((ok, bad) => {
  const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s);
});
$("pdfBtn").onclick = async () => {
  if(!build()) return;
  const wasPreview = document.body.classList.contains("preview");
  document.body.classList.add("preview");
  $("pdfBtn").disabled = true; say("Preparing PDF…");
  const inner = $("scalerInner"), keep = inner.style.transform;
  try{
    if(!window.jspdf)       await loadScript("https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js");
    if(!window.html2canvas) await loadScript("https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js");
    inner.style.transform = "none";
    const sheets = [...inner.querySelectorAll(".sheet")];
    const pdf = new jspdf.jsPDF({ unit:"mm", format:"a4", compress:true });
    for(let i = 0; i < sheets.length; i++){
      const c = await html2canvas(sheets[i], { scale:2, backgroundColor:"#fff" });
      if(i) pdf.addPage();
      pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
    }
    pdf.save("parcel-labels-" + new Date().toISOString().slice(0,10) + ".pdf");
    say("PDF saved to your downloads.");
  }catch(e){
    console.error(e);
    say("Couldn't build the PDF" + (navigator.onLine ? "" : " — you're offline") + ". Use Print / Save as PDF instead.");
  }
  inner.style.transform = keep;
  $("pdfBtn").disabled = false;
  if(wasPreview) fit(); else document.body.classList.remove("preview");
};

boot();

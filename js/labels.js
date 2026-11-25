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
    <div class="destination"><div class="toLbl">To</div>
    <div class="toName">${esc(a.name)}</div>
    <div class="toAddr">${esc(addr)}</div>
    ${a.phone ? `<div class="phone">Ph: ${esc(a.phone)}</div>` : ""}
    ${c === "India"
      ? `<div class="pinRow"><span class="pl">PIN</span>${pinBoxes(a.pin)}</div>`
      : (a.pin ? `<div class="pinRow"><span class="pl">${c === "Japan" ? "〒" : "POST CODE"}</span><span class="toName postBig">${esc(a.pin)}</span></div>` : "")}
    </div><div class="foot"><div class="from"><div class="fromLbl">From</div>
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
  let paperwork;
  try{ paperwork = customsSheets(activeSender(),chosen[0]); }
  catch(e){ say(e.message); $("previewMessage").textContent = e.message; return false; }
  $("scalerInner").innerHTML = buildSheets(cls,main) + (slips.length ? buildSheets("four",slips) : "") + paperwork;
  // Measure the full-size print cells even when the Home screen hides the preview.
  document.body.classList.add("measureLabels");
  const overflow = Array.from(document.querySelectorAll("#scalerInner .label, #scalerInner .customsPaper")).some(label =>
    label.scrollHeight > label.clientHeight + 1 || label.scrollWidth > label.clientWidth + 1);
  document.body.classList.remove("measureLabels");
  if(overflow){
    const message = paperwork ? "Text exceeds the available page area. Shorten the address or item descriptions, or select a larger label." : "Text exceeds the label area. Try a larger label, shorten the text, or turn off the inside slip.";
    say(message);
    $("previewMessage").textContent = message;
    return false;
  }
  fit();
  say(`${main.length} label${main.length>1?"s":""} ready${slips.length?`, plus ${slips.length} inside slip${slips.length>1?"s":""}`:""}.`);
  return true;
}
function fit(){
  const inner = $("scalerInner"), holder = inner.parentNode;
  if(!holder.clientWidth || !inner.offsetWidth) return;
  const scale = Math.min(1, holder.clientWidth / inner.offsetWidth);
  inner.style.transform = `scale(${scale})`;
  holder.style.height = Math.ceil(inner.offsetHeight * scale) + "px";
  updatePageNumber();
}
function updatePageNumber(){
  const pages = $("scalerInner").children;
  if(!pages.length) return;
  const scroller = $("sheets");
  let page = 0;
  if(scroller.scrollTop > 0){
    if(scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1){
      page = pages.length - 1;
    }else{
      const top = $("previewHeading").getBoundingClientRect().bottom;
      const bottom = document.querySelector(".bar").getBoundingClientRect().top;
      const middle = (top + bottom) / 2;
      while(page + 1 < pages.length && pages[page].getBoundingClientRect().bottom < middle) page++;
    }
  }
  $("pageNumber").textContent = (page + 1) + " of " + pages.length;
}
$("sheets").addEventListener("scroll", updatePageNumber);
window.addEventListener("resize", () => { if(document.body.classList.contains("preview")) fit(); });

let editorScroll = 0;
$("previewBtn").onclick = () => {
  if(!build()) return;
  rememberPreparedParcels();
  editorScroll = window.scrollY;
  document.body.classList.add("preview");
  $("hideBtn").style.display = "inline-block";
  $("sheets").scrollTop = 0;
  $("previewMessage").textContent = "";
  fit();
  $("hideBtn").focus({preventScroll:true});
};
$("hideBtn").onclick = () => {
  document.body.classList.remove("preview");
  $("hideBtn").style.display = "none";
  $("previewBtn").focus({preventScroll:true});
  window.scrollTo(0, editorScroll);
};
$("printBtn").onclick = () => { if(build()){ rememberPreparedParcels(true); setTimeout(() => window.print(), 60); } };

/* ---------- direct PDF download ---------- */
/* Renders each A4 sheet to canvas and packs them into one PDF — no print dialog.
   Libraries load lazily from CDN on first use; offline, the print path still works. */
const loadScript = src => new Promise((ok, bad) => {
  const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s);
});
$("pdfBtn").onclick = async () => {
  if(!build()) return;
  const exportedLabel = currentLabel();
  const wasPreview = document.body.classList.contains("preview");
  const homeScroll = window.scrollY;
  document.body.classList.add("preview");
  $("previewMessage").textContent = "Preparing PDF…";
  fit();
  $("hideBtn").disabled = true;
  $("printBtn").disabled = true;
  $("pdfBtn").disabled = true;
  try{
    if(!window.jspdf)       await loadScript("https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js");
    if(!window.html2canvas) await loadScript("https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js");
    const sheets = [...$("scalerInner").querySelectorAll(".sheet")];
    const pdf = new jspdf.jsPDF({ unit:"mm", format:"a4", compress:true });
    for(let i = 0; i < sheets.length; i++){
      const c = await html2canvas(sheets[i], {
        scale:2, backgroundColor:"#fff",
        onclone(doc){
          doc.getElementById("scalerInner").style.transform = "none";
          doc.querySelector(".scaler").style.overflow = "visible";
          doc.getElementById("sheets").style.overflow = "visible";
        }
      });
      if(i) pdf.addPage();
      pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, 297);
    }
    pdf.save("parcel-labels-" + new Date().toISOString().slice(0,10) + ".pdf");
    if(exportedLabel === currentLabel()) rememberPreparedParcels(true);
    say("PDF saved to your downloads.");
  }catch(e){
    console.error(e);
    say("Couldn't build the PDF" + (navigator.onLine ? "" : " — you're offline") + ". Use Print / Save as PDF instead.");
  }finally{
    $("hideBtn").disabled = false;
    $("printBtn").disabled = false;
    $("pdfBtn").disabled = false;
    if(wasPreview){
      $("previewMessage").textContent = $("status").textContent;
      fit();
    }else{
      document.body.classList.remove("preview");
      window.scrollTo(0, homeScroll);
    }
  }
};

boot();

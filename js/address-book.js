let archivedRecipients = [];
const csvFields = ["name","label","phone","line","city","district","state","pin","country","address_romaji"];
function setBookRows(rows){
  addresses = rows.filter(row => !row.archived);
  archivedRecipients = rows.filter(row => row.archived);
}
async function loadBookRows(){
  const rows = [];
  for(;;){
    const page = await rest("tapal_addresses?select=*&order=name,id&limit=200&offset=" + rows.length);
    rows.push(...page);
    if(page.length < 200) return rows;
  }
}
function renderArchived(){
  $("archivedList").innerHTML = archivedRecipients.map(a =>
    `<div class="entry"><span>${esc([a.label,a.name,a.city].filter(Boolean).join(" · "))}</span>
    ${canWrite() ? `<button class="btn ghost small" data-restore="${esc(a.id)}">Restore</button>` : ""}</div>`
  ).join("") || '<p class="empty">No archived recipients.</p>';
}
async function changeArchive(id, archived){
  try{
    if(online){
      const rows = await rest("tapal_addresses?id=eq." + encodeURIComponent(id), {
        method:"PATCH", headers:RETURN, body:JSON.stringify({archived})
      });
      if(!rows.length) throw Error("Recipient could not be updated.");
      setBookRows([...addresses,...archivedRecipients].map(a => a.id === id ? {...a,archived} : a));
    }else{
      setBookRows(await saveDeviceAddress("addresses",{id,archived},true));
    }
    delete ui[id];
    render(); fillLogPicker();
    $("bookStatus").textContent = archived ? "Recipient archived." : "Recipient restored.";
  }catch(error){ $("bookStatus").textContent = error.message; }
}
$("archivedList").addEventListener("click", event => {
  const id = event.target.getAttribute("data-restore");
  if(id && canWrite()) changeArchive(id,false);
});

function recipientCells(row){
  return csvFields.map(key => String((key === "line" ? row.line ?? row.addr : row[key]) || (key === "country" ? "India" : "")));
}
// Quote spreadsheet formulas as text. Double a leading apostrophe for reversible export.
function encodeCell(value){
  const safe = /^[\s]*[=+@-]|^['\t\r]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g,'""') + '"';
}
$("exportAddresses").onclick = () => {
  const csv = [csvFields,...addresses.map(recipientCells)].map(row => row.map(encodeCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url; link.download = "tapal-recipients.csv"; link.click();
  setTimeout(() => URL.revokeObjectURL(url),10000);
};

function parseRecipientCSV(text){
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  text = text.replace(/^\uFEFF/,"");
  for(let i=0; i<text.length; i++){
    const ch = text[i];
    if(quoted){
      if(ch !== '"') field += ch;
      else if(text[i+1] === '"'){ field += '"'; i++; }
      else { quoted = false; closed = true; }
    }else if(ch === "," || ch === "\r" || ch === "\n"){
      row.push(field); field = ""; closed = false;
      if(ch !== ","){
        if(ch === "\r" && text[i+1] === "\n") i++;
        if(row.some(Boolean)) rows.push(row);
        row = [];
      }
    }else if(ch === '"' && !closed && !field){ quoted = true; }
    else if(ch === '"' || closed){ throw Error("Invalid CSV quoting."); }
    else field += ch;
  }
  if(quoted) throw Error("Unclosed quote in CSV.");
  row.push(field);
  if(row.some(Boolean)) rows.push(row);
  if(JSON.stringify(rows.shift()) !== JSON.stringify(csvFields)) throw Error("Use the column headings from a Tapal CSV export.");
  return rows.map((cells,i) => {
    if(cells.length !== csvFields.length) throw Error("Incorrect column count in record " + (i+1));
    const rec = Object.fromEntries(csvFields.map((key,j) => [key,cells[j].replace(/^'(?='|\s*[=+@-]|[\t\r])/,"")]));
    if(!rec.name.trim() || !Object.hasOwn(FORMATS,rec.country)) throw Error("Check name and country in record " + (i+1));
    if(rec.pin && postalError(rec)) throw Error("Check postal code in record " + (i+1));
    return rec;
  });
}
function newRecipients(existing, incoming){
  const seen = new Set(existing.map(row => JSON.stringify(recipientCells(row))));
  return incoming.filter(row => {
    const key = JSON.stringify(recipientCells(row));
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
}
$("importAddresses").onchange = async event => {
  const input = event.target, file = input.files[0];
  if(!file || !canWrite()) return;
  input.disabled = true;
  const wasOnline = online, owner = session?.user_id;
  try{
    const incoming = parseRecipientCSV(await file.text());
    if(online !== wasOnline || session?.user_id !== owner || !canWrite()) throw Error("Connection or account changed. Select the file again.");
    const existing = online ? await loadBookRows() : [...addresses,...archivedRecipients];
    if(online !== wasOnline || session?.user_id !== owner || !canWrite()) throw Error("Connection or account changed. Select the file again.");
    const fresh = newRecipients(existing,incoming);
    let count = 0;
    if(fresh.length && confirm("Import " + fresh.length + " new recipients?")){
      if(online){
        fresh.forEach(row => { if(!row.pin) row.pin = null; });
        if(!fresh.some(row => row.address_romaji)) fresh.forEach(row => delete row.address_romaji);
        const saved = await rest("tapal_addresses",{method:"POST",headers:RETURN,body:JSON.stringify(fresh)});
        addresses.push(...saved.map(row => ({...row,addr:row.line})));
        count = saved.length;
      }else{
        setBookRows(await saveDeviceRows("addresses",rows => {
          const add = newRecipients(rows,fresh);
          count = add.length;
          return [...rows,...add.map(row => ({...row,id:deviceId(),addr:row.line}))];
        }));
      }
      render(); fillLogPicker();
    }
    $("bookStatus").textContent = count + " imported. " + (incoming.length - fresh.length) + " duplicates skipped.";
  }catch(error){ $("bookStatus").textContent = "Import failed. " + error.message; }
  finally{ input.value = ""; input.disabled = !canWrite(); }
};

/* Optional working copy for one India–Japan parcel. Official forms come from the carrier. */
let customsParcel = "";
const customsServices = {
  Japan:["Japan Post International Mail My Page", "https://www.int-mypage.post.japanpost.jp/mypage/M010000.do?request_locale=en"],
  India:["India Post customs declarations", "https://www.indiapost.gov.in/documents/reports/customs-declaration"]
};

function updateCustoms(sender, selected){
  const to = selected.length === 1 && selected[0];
  const fromCountry = sender.country || "India", toCountry = to && (to.country || "India");
  const eligible = sender.id && to && ((fromCountry === "Japan" && toCountry === "India") ||
    (fromCountry === "India" && toCountry === "Japan"));
  const key = eligible ? JSON.stringify([session?.user_id,online,sender.id,to.id,fromCountry,toCountry]) : "";
  $("customsOptions").hidden = !eligible;
  if(key === customsParcel) return;
  customsParcel = key;
  $("customsOptions").open = false;
  $("includeCustoms").checked = false;
  $("customsFields").hidden = true;
  $("customsItems").replaceChildren();
  if(eligible){
    $("customsCurrency").value = fromCountry === "Japan" ? "JPY" : "INR";
    const [name,url] = customsServices[fromCountry];
    $("customsService").textContent = name;
    $("customsService").href = url;
  }
}

function addCustomsItem(){
  const row = document.createElement("fieldset");
  row.className = "grid";
  row.innerHTML = '<legend>Contents item</legend><label>Description<input required maxlength="160" name="description" placeholder="e.g. Cotton shirt"></label>' +
    '<label>Quantity<input required name="quantity" type="number" min="1" max="9999" step="1" value="1"></label>' +
    '<label>Unit value<input required name="price" type="number" min="0" max="99999999" step="0.01"></label>' +
    '<button type="button" class="btn ghost small">Remove item</button>';
  row.querySelector("button").onclick = () => row.remove();
  $("customsItems").appendChild(row);
}
$("addCustomsItem").onclick = addCustomsItem;
$("includeCustoms").onchange = () => {
  $("customsFields").hidden = !$("includeCustoms").checked;
  if($("includeCustoms").checked && !$("customsItems").children.length) addCustomsItem();
};

function customsSheets(sender, recipient){
  if(!customsParcel || !$("includeCustoms").checked) return "";
  const rows = [];
  const currency = $("customsCurrency").value;
  const money = cents => currency + " " + (cents / 100).toFixed(2);
  let total = 0;
  for(const row of $("customsItems").children){
    const [description,quantity,price] = row.querySelectorAll("input");
    const invalid = [description,quantity,price].find(input => !input.validity.valid || !input.value.trim());
    if(invalid){
      $("customsOptions").open = true;
      invalid.focus(); invalid.reportValidity();
      throw Error("Complete the description, quantity and unit value for each customs item.");
    }
    const cents = Math.round(price.valueAsNumber * 100);
    const line = cents * quantity.valueAsNumber;
    total += line;
    if(!Number.isSafeInteger(total)) throw Error("Declared total is too large.");
    rows.push(`<tr><td>${esc(description.value.trim())}</td><td>${quantity.valueAsNumber}</td><td>${money(cents)}</td><td>${money(line)}</td></tr>`);
  }
  if(!rows.length) throw Error("Add at least one customs item or turn off the worksheet.");
  const address = person => esc(addrLines(person,{name:true,country:true}).join("\n"));
  const pages = [];
  for(let i=0;i<rows.length;i+=6){
    const last = i+6 >= rows.length;
    pages.push(`<section class="sheet customsSheet"><div class="customsPaper">
      <h2>Customs preparation worksheet</h2><p>Working copy for the carrier’s CN22 / CN23 process · ${1+i/6} of ${Math.ceil(rows.length/6)}</p>
      <div class="customsParties"><div><strong>From</strong><p>${address(sender)}</p></div><div><strong>To</strong><p>${address(recipient)}</p></div></div>
      <table><thead><tr><th>Item description</th><th>Qty</th><th>Unit value</th><th>Line value</th></tr></thead><tbody>${rows.slice(i,i+6).join("")}</tbody></table>
      ${last ? `<p><strong>Total declared value · ${money(total)}</strong></p>` : ""}
      <p>Complete the official declaration through ${esc(customsServices[sender.country || "India"][0])}.</p>
      </div></section>`);
  }
  return pages.join("");
}

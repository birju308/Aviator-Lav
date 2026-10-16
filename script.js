(() => {
  "use strict";
  const STORAGE_KEY = "aviatorAnalyzer.rounds.v2";
  const MAX_ROUNDS = 5000;
  const $ = (id) => document.getElementById(id);
  let rounds = loadHistory();

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter(x => x && Number.isFinite(x.multiplier) && x.multiplier >= 1 && typeof x.timestamp === "string").slice(-MAX_ROUNDS);
    } catch (_) { return []; }
  }
  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds.slice(-MAX_ROUNDS)));
      $("saveStatus").textContent = "Saved in this browser on this device.";
    } catch (_) { $("saveStatus").textContent = "Could not save. Browser storage may be disabled or full."; }
  }
  function values() { return rounds.map(x => x.multiplier); }
  function median(arr) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a,b) => a-b), m = Math.floor(s.length/2);
    return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
  }
  function quantile(arr, q) {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a,b) => a-b);
    return s[Math.max(0, Math.min(s.length-1, Math.ceil(q*s.length)-1))];
  }
  function fmt(n) { return Number.isFinite(n) ? `${n.toFixed(2)}x` : "N/A"; }
  function pct(n, total) { return total ? `${(100*n/total).toFixed(1)}%` : "N/A"; }

  function render() {
    const vals = values(), n = vals.length;
    $("totalRounds").textContent = n.toLocaleString();
    $("averageValue").textContent = n ? fmt(vals.reduce((a,b)=>a+b,0)/n) : "N/A";
    $("medianValue").textContent = fmt(median(vals));
    $("belowTwoValue").textContent = n ? pct(vals.filter(v=>v<2).length,n) : "N/A";
    $("historyCount").textContent = `${n} / ${MAX_ROUNDS}`;
    $("historyCountSecondary").textContent = `${n} saved`;
    $("dataMeter").style.width = `${Math.min(100, n)}%`;
    $("dataMeterLabel").textContent = `${n} round${n===1?"":"s"} recorded`;
    const body = $("historyBody"); body.replaceChildren();
    if (!n) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan=4; td.className="empty"; td.textContent="No results yet. Add a completed round above.";
      tr.appendChild(td); body.appendChild(tr); return;
    }
    rounds.slice().reverse().forEach((r, rev) => {
      const idx=n-1-rev, tr=document.createElement("tr");
      const cells=[String(idx+1),fmt(r.multiplier),new Date(r.timestamp).toLocaleString()];
      cells.forEach((v,i)=>{const td=document.createElement("td");td.textContent=v;if(i===1)td.className=r.multiplier<2?"low":"multiplier";tr.appendChild(td);});
      const td=document.createElement("td"), btn=document.createElement("button");
      btn.type="button";btn.className="remove-button";btn.textContent="Remove";
      btn.addEventListener("click",()=>{rounds.splice(idx,1);saveHistory();render();resetAnalysis("History changed. Run analysis again.");});
      td.appendChild(btn);tr.appendChild(td);body.appendChild(tr);
    });
  }
  function resetAnalysis(message) {
    $("analysisOutput").textContent=message;
    $("estimateValue").innerHTML='--<small>x</small>';
    $("rangeValue").textContent="--";
    $("modelStatus").textContent="NEEDS ANALYSIS";
  }
  function analyze() {
    const vals=values(), n=vals.length;
    if (!n) {
      $("modelStatus").textContent="NO DATA";
      $("estimateValue").innerHTML='--<small>x</small>';
      $("rangeValue").textContent="--";
      $("analysisOutput").textContent="Enter completed multipliers first. No estimate can be calculated without data.";
      return;
    }
    const med=median(vals), low=quantile(vals,.25), high=quantile(vals,.75);
    $("estimateValue").innerHTML=`${med.toFixed(2)}<small>x</small>`;
    $("rangeValue").textContent=`${fmt(low)} – ${fmt(high)}`;
    $("modelStatus").textContent=n<30?"SMALL SAMPLE":n<100?"EARLY SAMPLE":"HISTORICAL BASELINE";
    let msg=`Historical reference: the median of ${n} saved round${n===1?"":"s"} is ${fmt(med)}. The middle 50% of this sample spans ${fmt(low)} to ${fmt(high)}. `;
    if(n<30) msg+="This sample is very small. Collect more actual rounds before evaluating any statistical pattern. ";
    else if(n<100) msg+="This is an early sample, not evidence of predictive power. ";
    else msg+="Having 100+ rounds improves the description of this sample but does not make the next result predictable. ";
    msg+="The displayed median is not a forecast of the next crash point.";
    $("analysisOutput").textContent=msg;
  }
  $("resultForm").addEventListener("submit",e=>{
    e.preventDefault();
    const input=$("multiplierInput"), error=$("inputError");
    const raw=input.value.trim().toLowerCase().replace(/x$/,"").replace(",",".");
    const val=Number(raw);
    if(!raw||!Number.isFinite(val)||val<1||val>1000000){error.textContent="Enter a valid completed multiplier of at least 1.00, e.g. 1.45.";error.hidden=false;return;}
    if(rounds.length>=MAX_ROUNDS){error.textContent=`Maximum ${MAX_ROUNDS} rounds reached. Export your data first.`;error.hidden=false;return;}
    error.hidden=true;rounds.push({multiplier:val,timestamp:new Date().toISOString()});saveHistory();render();input.value="";input.focus();resetAnalysis("Round added. Run analysis to refresh the historical reference.");
  });
  $("analyzeButton").addEventListener("click",analyze);
  $("clearButton").addEventListener("click",()=>{
    if(!rounds.length)return;
    if(!confirm("Delete all saved rounds from this browser? Export a CSV first if you need a backup."))return;
    rounds=[];saveHistory();render();resetAnalysis("History cleared. Add completed results to begin again.");
  });
  $("exportButton").addEventListener("click",()=>{
    if(!rounds.length){alert("There are no rounds to export yet.");return;}
    const rows=[["round_number","multiplier","timestamp"],...rounds.map((r,i)=>[i+1,r.multiplier,r.timestamp])];
    const csv=rows.map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="aviator-round-history.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  });
  $("importFile").addEventListener("change",async e=>{
    const file=e.target.files && e.target.files[0]; if(!file)return;
    try{
      const text=await file.text(), lines=text.split(/\r?\n/).filter(Boolean);
      let imported=0;
      for(let i=1;i<lines.length && rounds.length<MAX_ROUNDS;i++){
        const cols=lines[i].split(",");
        const cleaned=(cols[1]||"").replace(/"/g,"").trim().toLowerCase().replace(/x$/,"").replace(",",".");
        const val=Number(cleaned);
        if(Number.isFinite(val)&&val>=1&&val<=1000000){
          const timestamp=(cols[2]||"").replace(/"/g,"").trim();
          rounds.push({multiplier:val,timestamp:timestamp&&Number.isFinite(Date.parse(timestamp))?new Date(timestamp).toISOString():new Date().toISOString()}); imported++;
        }
      }
      saveHistory();render();resetAnalysis(`${imported} valid round(s) imported. Run analysis to refresh the historical reference.`);
    }catch(_){alert("Could not read this CSV. Use a CSV exported by this app.");}
    e.target.value="";
  });
  render();
  if(rounds.length) analyze();
})();
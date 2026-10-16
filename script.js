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


  function renderPatternStats(vals) {
    const n = vals.length;
    let currentStreak = 0, longestStreak = 0, run = 0;
    for (const v of vals) {
      if (v < 2) { run++; longestStreak = Math.max(longestStreak, run); }
      else run = 0;
    }
    for (let i = n - 1; i >= 0 && vals[i] < 2; i--) currentStreak++;
    const last20 = vals.slice(-20);
    const high5 = vals.filter(v => v >= 5).length;
    const high10 = vals.filter(v => v >= 10).length;
    $("currentLowStreak").textContent = n ? String(currentStreak) : "N/A";
    $("longestLowStreak").textContent = n ? String(longestStreak) : "N/A";
    $("highFiveValue").textContent = n ? `${high5} (${pct(high5,n)})` : "N/A";
    $("highTenValue").textContent = n ? `${high10} (${pct(high10,n)})` : "N/A";
    $("recentBelowValue").textContent = last20.length ? pct(last20.filter(v => v < 2).length, last20.length) : "N/A";
  }

  function receiveAutoSync(message) {
    if (!Array.isArray(message.rounds)) return;
    let added = 0;
    const existingIds = new Set(rounds.map(r => r.extensionId).filter(Boolean));
    for (const item of message.rounds) {
      if (!item || typeof item.id !== "string" || existingIds.has(item.id)) continue;
      const multiplier = Number(item.multiplier);
      if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 1000000) continue;
      const parsedTime = Date.parse(item.timestamp || "");
      rounds.push({
        multiplier,
        timestamp: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString(),
        extensionId: item.id,
        source: "Chrome extension auto-sync"
      });
      existingIds.add(item.id);
      added++;
      if (rounds.length >= MAX_ROUNDS) break;
    }
    if (added) {
      rounds = rounds.slice(-MAX_ROUNDS);
      saveHistory();
      render();
      analyze();
    }
    const frameCount = Array.isArray(message.frames) ? message.frames.length : 0;
    const latest = message.lastCollectedAt ? new Date(message.lastCollectedAt).toLocaleTimeString() : "not yet";
    const target = $("extensionSyncStatus");
    if (target) {
      target.textContent = `Chrome extension connected · ${Number(message.totalCollected ?? message.rounds.length).toLocaleString()} collected result(s) in extension storage · ${added} new result(s) synced this check. Game-tab activity last recorded: ${latest}. Keep Chrome and the Aviator tab open to collect new rounds.`;
    }
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (message && ["aviator-lab-extension-v05", "aviator-lab-extension-v06", "aviator-lab-extension-v07", "aviator-lab-extension-v08", "aviator-lab-extension-v09", "aviator-lab-extension-v10", "aviator-lab-extension-v11"].includes(message.source) && message.type === "AUTO_ROUND_SYNC") {
      receiveAutoSync(message);
      window.postMessage({
        source: "aviator-lab-page-v06",
        type: "AUTO_SYNC_ACK",
        ids: Array.isArray(message.rounds) ? message.rounds.map(item => item && item.id).filter(Boolean) : []
      }, window.location.origin);
    }
  });


  function outcomeBand(value) {
    if (value < 2) return 0;
    if (value < 5) return 1;
    if (value < 10) return 2;
    return 3;
  }


  function calculateBandModel(history) {
    const n = history.length;
    const overall = [0, 0, 0, 0], recent = [0, 0, 0, 0];
    for (const v of history) overall[outcomeBand(v)]++;
    const recentValues = history.slice(-Math.min(50, n));
    for (const v of recentValues) recent[outcomeBand(v)]++;
    const rn = recentValues.length;
    const scores = overall.map((count, i) =>
      (n ? 0.65 * ((count + 1) / (n + 4)) : 0) +
      (rn ? 0.35 * ((recent[i] + 1) / (rn + 4)) : 0)
    );
    const sum = scores.reduce((a, b) => a + b, 0) || 1;
    const probabilities = scores.map(p => p / sum);
    let top = 0;
    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i] > probabilities[top]) top = i;
    }
    return {top, probabilities, overall, recent, n, rn};
  }


  function calculatePatternGuess(history) {
    const names = ["1.00x–1.99x", "2.00x–4.99x", "5.00x–9.99x", "10.00x+"];
    const seq = history.map(outcomeBand);
    const n = seq.length;
    if (!n) return {top:0, scores:[0.25,0.25,0.25,0.25], names, support:0, motifLength:0, motifHits:0, transitionCount:0, currentStreak:0, recentSequence:[], lastBand:0, bandMedian:NaN, status:"WAITING FOR DATA"};

    const counts = [1,1,1,1];
    seq.forEach(b => counts[b]++);
    const overallTotal = counts.reduce((a,b)=>a+b,0);
    const overall = counts.map(c=>c/overallTotal);

    const recentSeq = seq.slice(-Math.min(25,n));
    const recentCounts = [1,1,1,1];
    recentSeq.forEach(b=>recentCounts[b]++);
    const recentTotal = recentCounts.reduce((a,b)=>a+b,0);
    const recent = recentCounts.map(c=>c/recentTotal);

    const lastBand = seq[n-1];
    let currentStreak = 1;
    for(let i=n-2;i>=0 && seq[i]===lastBand;i--) currentStreak++;

    const transitionCounts = [1,1,1,1];
    let transitionCount = 0;
    for(let i=1;i<n;i++) {
      if(seq[i-1]===lastBand) {
        transitionCounts[seq[i]]++;
        transitionCount++;
      }
    }
    const transitionTotal = transitionCounts.reduce((a,b)=>a+b,0);
    const transition = transitionCounts.map(c=>c/transitionTotal);

    let motif = null;
    for(let length=Math.min(3,n-1); length>=2; length--) {
      const suffix=seq.slice(n-length);
      const nextCounts=[1,1,1,1];
      let hits=0;
      for(let i=0;i+length<n;i++) {
        let match=true;
        for(let j=0;j<length;j++) if(seq[i+j]!==suffix[j]) {match=false;break;}
        if(match) {nextCounts[seq[i+length]]++;hits++;}
      }
      if(hits>=2) {
        const total=nextCounts.reduce((a,b)=>a+b,0);
        motif={length,hits,distribution:nextCounts.map(c=>c/total),sequence:suffix};
        break;
      }
    }

    // Compare outcomes that followed runs of the same length (run length capped at 4).
    const cappedRun=Math.min(4,currentStreak);
    const runCounts=[1,1,1,1];
    let runHits=0;
    for(let end=0;end<n-1;end++) {
      let length=1;
      for(let j=end-1;j>=0 && seq[j]===seq[end];j--) length++;
      if(Math.min(4,length)===cappedRun) {
        runCounts[seq[end+1]]++;
        runHits++;
      }
    }
    const runTotal=runCounts.reduce((a,b)=>a+b,0);
    const runDist=runCounts.map(c=>c/runTotal);

    // Evidence-weighted blend. Unsupported conditional features receive no weight.
    const components=[{w:0.28,p:overall},{w:0.22,p:recent}];
    if(transitionCount>=3) components.push({w:0.22,p:transition});
    if(motif) components.push({w:0.18,p:motif.distribution});
    if(runHits>=3) components.push({w:0.10,p:runDist});
    const weightSum=components.reduce((sum,c)=>sum+c.w,0);
    const scores=[0,0,0,0];
    for(const c of components) for(let b=0;b<4;b++) scores[b]+=c.w*c.p[b]/weightSum;
    let top=0;
    for(let b=1;b<4;b++) if(scores[b]>scores[top]) top=b;
    const valuesInBand=history.filter(v=>outcomeBand(v)===top);
    const bandMedian=valuesInBand.length?median(valuesInBand):NaN;
    const support=(transitionCount>=3?transitionCount:0)+(motif?motif.hits:0)+(runHits>=3?runHits:0);
    return {
      top,scores,names,support,motifLength:motif?.length||0,motifHits:motif?.hits||0,
      transitionCount,currentStreak,recentSequence:seq.slice(-4).map(b=>names[b]),
      lastBand,bandMedian,status:n<20?"BUILDING SAMPLE":n<100?"EARLY SAMPLE":"PATTERN TEST",
      runHits,cappedRun
    };
  }

  function renderPatternLearner(vals) {
    const model=calculatePatternGuess(vals);
    $("patternModelStatus").textContent=model.status;
    $("patternGuessBand").textContent=vals.length?model.names[model.top]:"N/A";
    $("patternGuessMedian").textContent=Number.isFinite(model.bandMedian)?fmt(model.bandMedian):"N/A";
    $("patternGuessScore").textContent=vals.length?`${(model.scores[model.top]*100).toFixed(1)}%`:"N/A";
    $("patternMotifHits").textContent=model.motifHits?String(model.motifHits):"0";
    $("patternMotifNote").textContent=model.motifHits?`matching ${model.motifLength}-band motifs`:"No repeated motif with 2+ matches";
    $("patternCurrentStreak").textContent=vals.length?`${model.currentStreak} × ${model.names[model.lastBand]}`:"N/A";
    $("patternRecentSequence").textContent=model.recentSequence.length?model.recentSequence.join(" → "):"N/A";
    $("patternTransitionEvidence").textContent=vals.length
      ?`${model.transitionCount} prior transition(s) after ${model.names[model.lastBand]}`
      :"N/A";
    let message=vals.length
      ?`Test-mode guess: ${model.names[model.top]} is the highest-scoring historical band (${(model.scores[model.top]*100).toFixed(1)} relative score). Its within-band historical median is ${fmt(model.bandMedian)}. `
      :"Add completed rounds to calculate pattern features. ";
    if(vals.length<50) message+="There are too few results to assess conditional patterns reliably. ";
    if(model.motifHits>=2) message+=`The latest ${model.motifLength}-band motif has ${model.motifHits} historical match(es), whose following bands help inform the score. `;
    else message+="No repeated 2- or 3-band motif has enough matches to add weight. ";
    if(model.transitionCount>=3) message+=`The current band has ${model.transitionCount} observed historical follow-up(s). `;
    else message+="The current-band transition history is sparse. ";
    message+="This is a pattern-based experiment, not a validated AI or a reliable forecast of an independent random crash.";
    $("patternExplanation").textContent=message;
  }

  function renderAdaptiveModel(vals) {
    const n = vals.length;
    const names = ["1.00x–1.99x", "2.00x–4.99x", "5.00x–9.99x", "10.00x+"];
    const model = calculateBandModel(vals);
    const matching = vals.filter(v => outcomeBand(v) === model.top);
    $("modelSampleSize").textContent = n.toLocaleString();
    $("modelTopBand").textContent = n ? names[model.top] : "N/A";
    $("modelTopProbability").textContent = n ? `${(model.probabilities[model.top] * 100).toFixed(1)}%` : "N/A";
    $("modelBandMedian").textContent = matching.length ? fmt(median(matching)) : "N/A";
    $("adaptiveModelStatus").textContent = n < 30 ? "TINY SAMPLE" : n < 100 ? "EARLY SAMPLE" : "HISTORICAL MIX";
    for (let i = 0; i < 4; i++) {
      $("modelP" + i).textContent = n ? `${(model.probabilities[i] * 100).toFixed(1)}%` : "N/A";
      $("modelBar" + i).style.width = `${(model.probabilities[i] * 100).toFixed(1)}%`;
      $("modelDetail" + i).textContent = n
        ? `${model.overall[i]} / ${n} overall · ${model.recent[i]} / ${model.rn} in last saved entries`
        : "No data";
    }

    // Chronological model selection + untouched holdout.
    const candidateNames = [
      "Smoothed history blend",
      "Recent 25-round majority",
      "Last-band transition",
      "Decay-weighted frequency",
      "Pattern sequence learner"
    ];
    const chooseTop = counts => {
      let top = 0;
      for (let j = 1; j < counts.length; j++) if (counts[j] > counts[top]) top = j;
      return top;
    };
    const majorityOf = history => {
      const counts = [1,1,1,1];
      history.forEach(v => counts[outcomeBand(v)]++);
      return chooseTop(counts);
    };
    const recentMajorityOf = history => {
      const counts = [1,1,1,1];
      history.slice(-25).forEach(v => counts[outcomeBand(v)]++);
      return chooseTop(counts);
    };
    const transitionOf = history => {
      if (history.length < 2) return majorityOf(history);
      const last = outcomeBand(history[history.length - 1]);
      const counts = [1,1,1,1];
      let transitions = 0;
      for (let j = 1; j < history.length; j++) {
        if (outcomeBand(history[j - 1]) === last) {
          counts[outcomeBand(history[j])]++;
          transitions++;
        }
      }
      return transitions >= 4 ? chooseTop(counts) : majorityOf(history);
    };
    const decayOf = history => {
      if (!history.length) return 0;
      const counts = [1,1,1,1];
      for (let j = 0; j < history.length; j++) {
        counts[outcomeBand(history[j])] += Math.pow(0.94, history.length - 1 - j);
      }
      return chooseTop(counts);
    };
    const predictCandidates = train => [
      calculateBandModel(train).top,
      recentMajorityOf(train),
      transitionOf(train),
      decayOf(train),
      calculatePatternGuess(train).top
    ];
    const walkForward = [];
    if (n >= 20) {
      const warmup = Math.min(30, Math.max(12, Math.floor(n * 0.35)));
      for (let i = warmup; i < n; i++) {
        const train = vals.slice(0, i);
        const predictions = predictCandidates(train);
        const baseline = majorityOf(train);
        walkForward.push({
          index: i,
          actual: outcomeBand(vals[i]),
          predictions,
          baseline
        });
      }
    }
    // Choose the model only on the first 70% of chronological walk-forward examples.
    const holdoutCount = walkForward.length >= 10
      ? Math.max(5, Math.ceil(walkForward.length * 0.30))
      : walkForward.length ? Math.max(1, Math.ceil(walkForward.length * 0.30)) : 0;
    const split = Math.max(0, walkForward.length - holdoutCount);
    const devRows = walkForward.slice(0, split);
    const holdoutRows = walkForward.slice(split);
    const devHits = candidateNames.map((_, j) =>
      devRows.reduce((sum, row) => sum + (row.predictions[j] === row.actual ? 1 : 0), 0)
    );
    const devBaselineHits = devRows.reduce((sum, row) => sum + (row.baseline === row.actual ? 1 : 0), 0);
    let selectedIndex = 0;
    for (let j = 1; j < devHits.length; j++) {
      if (devHits[j] > devHits[selectedIndex]) selectedIndex = j;
    }
    const devCount = devRows.length;
    const devRates = devHits.map(h => devCount ? h / devCount : 0);
    const devBaselineRate = devCount ? devBaselineHits / devCount : 0;

    const holdoutModelHits = holdoutRows.reduce((sum, row) =>
      sum + (row.predictions[selectedIndex] === row.actual ? 1 : 0), 0);
    const holdoutBaselineHits = holdoutRows.reduce((sum, row) =>
      sum + (row.baseline === row.actual ? 1 : 0), 0);
    const holdoutN = holdoutRows.length;
    const holdoutRate = holdoutN ? holdoutModelHits / holdoutN : 0;
    const holdoutBaselineRate = holdoutN ? holdoutBaselineHits / holdoutN : 0;
    const developmentWinnerHits = devCount ? devHits[selectedIndex] : 0;

    $("modelBacktestHit").textContent = devCount
      ? `${developmentWinnerHits}/${devCount} (${(devRates[selectedIndex]*100).toFixed(1)}%)`
      : "Need 20+";
    $("modelBacktestBaseline").textContent = devCount
      ? `${devBaselineHits}/${devCount} (${(devBaselineRate*100).toFixed(1)}%)`
      : "Need 20+";
    $("modelBacktestCount").textContent = String(devCount);

    const compareBody = $("modelComparisonBody");
    if (compareBody) {
      compareBody.replaceChildren();
      const rows = candidateNames.map((name,i)=>({
        name, hits:devHits[i], rate:devRates[i],
        delta:devRates[i]-devBaselineRate
      }));
      rows.push({
        name:"Most-common-band baseline",
        hits:devBaselineHits,
        rate:devBaselineRate,
        delta:0
      });
      rows.forEach(row=>{
        const tr=document.createElement("tr");
        const cells=[
          row.name,
          devCount ? `${row.hits}/${devCount} (${(row.rate*100).toFixed(1)}%)` : "N/A",
          devCount ? (row.delta>0?"+":"")+`${(row.delta*100).toFixed(1)} pp` : "N/A"
        ];
        cells.forEach((value,i)=>{
          const td=document.createElement("td");
          td.textContent=value;
          if(i===2&&devCount) td.className=row.delta>0?"model-delta-positive":row.delta<0?"model-delta-negative":"model-delta-neutral";
          tr.appendChild(td);
        });
        compareBody.appendChild(tr);
      });
    }

    $("modelHoldoutSelected").textContent = devCount ? candidateNames[selectedIndex] : "N/A";
    $("modelHoldoutModelHits").textContent = holdoutN
      ? `${holdoutModelHits}/${holdoutN} (${(holdoutRate*100).toFixed(1)}%)` : "N/A";
    $("modelHoldoutBaselineHits").textContent = holdoutN
      ? `${holdoutBaselineHits}/${holdoutN} (${(holdoutBaselineRate*100).toFixed(1)}%)` : "N/A";
    $("modelHoldoutCount").textContent = String(holdoutN);

    const verdict = $("modelEdgeVerdict");
    const deltaNode = $("modelEdgeDelta");
    const explanation = $("modelEdgeExplanation");
    if (verdict && deltaNode && explanation) {
      const delta = holdoutRate - holdoutBaselineRate;
      if (n < 100 || holdoutN < 20 || devCount < 15) {
        verdict.textContent = "INSUFFICIENT HOLDOUT SAMPLE";
        deltaNode.textContent = `${holdoutN} reserved round(s)`;
        explanation.textContent = "The untouched validation segment is too small to tell whether the selected model has a real edge. Keep collecting clean, non-duplicate rounds.";
      } else if (delta >= 0.05) {
        verdict.textContent = "POTENTIAL EDGE — UNCONFIRMED";
        deltaNode.textContent = `+${(delta*100).toFixed(1)} pp vs baseline`;
        explanation.textContent = `${candidateNames[selectedIndex]} was chosen using only the earlier development window and beat the baseline in the untouched holdout. This is still exploratory and needs a larger future sample before it can be trusted.`;
      } else {
        verdict.textContent = "NO CLEAR EDGE IN HOLDOUT";
        deltaNode.textContent = `${(delta*100>0?"+":"")+(delta*100).toFixed(1)} pp vs baseline`;
        explanation.textContent = "The model selected on earlier rounds did not beat the baseline by at least 5 percentage points in the untouched holdout. Current history does not demonstrate useful predictive signal.";
      }
    }

    let note = n
      ? `The model currently ranks ${names[model.top]} highest in a smoothed history-frequency blend (${(model.probabilities[model.top] * 100).toFixed(1)}% score). Its displayed midpoint is the median of past results within that band—not an exact next-crash prediction. `
      : "Add completed results to calculate historical frequencies. ";
    if (n < 100 || holdoutN < 20) note += "The untouched holdout is too small to assess model quality reliably. ";
    else note += "The selected candidate was chosen on an earlier development window and then tested on a later holdout. A result on this sample still cannot guarantee future performance. ";
    note += "The frequency score is not a calibrated chance for the next round, and historical streaks do not make a result due.";
    $("adaptiveModelNote").textContent = note;
  }

  function render() {
    const vals = values(), n = vals.length;
    $("totalRounds").textContent = n.toLocaleString();
    $("averageValue").textContent = n ? fmt(vals.reduce((a,b)=>a+b,0)/n) : "N/A";
    $("medianValue").textContent = fmt(median(vals));
    $("belowTwoValue").textContent = n ? pct(vals.filter(v=>v<2).length,n) : "N/A";
    renderPatternStats(vals);
    renderPatternLearner(vals);
    renderAdaptiveModel(vals);
    const autoCount = rounds.filter(r => r && r.extensionId).length;
    const purgeButton = $("removeSyncedButton");
    if (purgeButton) purgeButton.textContent = `Remove auto-synced results (${autoCount})`;
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
      renderAdaptiveModel([]);
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
    msg+="This median is descriptive only. It is not a forecast or betting signal for the next crash point.";
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
  $("removeSyncedButton").addEventListener("click",()=>{
    const syncedCount = rounds.filter(r => r && r.extensionId).length;
    if (!syncedCount) {
      $("saveStatus").textContent = "No auto-synced results found. Manual/imported history was not changed.";
      return;
    }
    if (!confirm(`Remove ${syncedCount} auto-synced result(s) from this browser? Manually entered or CSV-imported rows will be kept.`)) return;
    rounds = rounds.filter(r => !(r && r.extensionId));
    saveHistory();
    render();
    analyze();
    const status = $("extensionSyncStatus");
    if (status) status.textContent = `Removed ${syncedCount} auto-synced result(s). Manually entered/imported history was preserved. Keep only one collector extension enabled to avoid duplicate captures.`;
  });
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
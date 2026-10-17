(() => {
  "use strict";
  const STORAGE_KEY = "aviatorAnalyzer.rounds.v2";
  const MAX_ROUNDS = 5000;
  const $ = (id) => document.getElementById(id);
  const PAPER_KEY = "aviatorAnalyzer.paperTracker.v3";
  let paperState = loadPaperState();

  function loadPaperState() {
    try {
      const saved = JSON.parse(localStorage.getItem(PAPER_KEY) || "{}");
      return {
        active: !!saved.active,
        pending: saved.pending && Number.isFinite(saved.pending.point) ? saved.pending : null,
        results: Array.isArray(saved.results) ? saved.results.filter(r => r && Number.isFinite(r.actual) && Number.isFinite(r.guess)).slice(-1000) : [],
        pendingRunForecasts: Array.isArray(saved.pendingRunForecasts) ? saved.pendingRunForecasts.filter(f => f && f.runLengthVersion === "run-length-v2" && typeof f.forecastId === "string").slice(-1000) : [],
        skipped: Number.isFinite(saved.skipped) ? saved.skipped : 0,
        lastMessage: typeof saved.lastMessage === "string" ? saved.lastMessage : ""
      };
    } catch (_) {
      return {active:false,pending:null,results:[],pendingRunForecasts:[],skipped:0,lastMessage:""};
    }
  }

  function savePaperState() {
    try { localStorage.setItem(PAPER_KEY, JSON.stringify(paperState)); } catch (_) {}
  }

  function makePaperForecast(history, pointEstimate) {
    if (!history.length) return null;
    const runPattern = calculateRunLengthSignal(history,{skipValidation:true});
    const model = calculatePatternGuess(history, runPattern);
    const point = pointEstimate || selectAdaptivePointEstimate(history);
    if (!Number.isFinite(point.value)) return null;
    return {
      point: point.value,
      baselinePoint: median(history.slice(-Math.min(50, history.length))),
      lookbackWindow: point.window,
      modelVersion: "streak-run-v2",
      pointModelVersion: "adaptive-median-v1",
      patternVersion: "run-length-v2",
      runLengthVersion: "run-length-v2",
      forecastId: "rlv2-" + history.length + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8),
      runSignal: runPattern.signal,
      runPatternScore: runPattern.probability,
      runPatternBaseline: runPattern.baselineProbability,
      runPatternContext: runPattern.context,
      runPatternSupport: runPattern.support,
      runPatternDepth: runPattern.depth,
      bpForecast: runPattern.forecastType,
      bpProbability: runPattern.probability,
      bpBaselineProbability: runPattern.baselineProbability,
      runCurrentType: runPattern.currentRunType,
      runCurrentLength: runPattern.currentRunLength,
      runLengthDistribution: runPattern.runLengthDistribution,
      runLengthBaselineDistribution: runPattern.runLengthBaselineDistribution,
      runLengthCategoryGuess: runPattern.runLengthGuess,
      runLengthSupport: runPattern.runLengthSupport,
      runLengthContextSupport: runPattern.runLengthContextSupport,
      runLengthContextDepth: runPattern.runLengthContextDepth,
      runLengthContext: runPattern.runLengthContext || "",
      band: model.top,
      bandLabel: model.names[model.top],
      modelScore: model.scores[model.top],
      sampleSize: history.length,
      createdAt: new Date().toISOString(),
      recentSequence: model.recentSequence
    };
  }

  function renderPaperTracker(pointEstimate) {
    const valuesNow = values();
    if (paperState.active && !paperState.pending) {
      paperState.pending = makePaperForecast(valuesNow,pointEstimate);
      savePaperState();
    }
    const pending = paperState.pending;
    $("paperStatus").textContent = paperState.active ? "PAPER TEST ACTIVE" : "PAUSED";
    $("paperNextGuess").textContent = pending ? fmt(pending.point) : (paperState.active ? "Waiting for data" : "Not started");
    $("paperNextReason").textContent = pending
      ? `Locked at ${new Date(pending.createdAt).toLocaleTimeString()} using ${pending.sampleSize} prior rounds. ${pending.modelVersion === "streak-run-v1" ? `Adaptive point estimate uses the latest ${pending.lookbackWindow||50}-round median; rolling-50 is the numeric baseline.` : "This forecast was locked by an earlier model version."} Top band: ${pending.bandLabel}; recent bands: ${(pending.recentSequence||[]).join(" → ")}. Run context: ${pending.runPatternContext||"not recorded"}; streak signal: ${pending.runSignal==="P"?"P · 2x+ lean":pending.runSignal==="B"?"B · below-2x lean":"no clear lean"}. Historical run score ${((Number.isFinite(pending.runPatternScore)?pending.runPatternScore:0.5)*100).toFixed(1)}% is not calibrated odds.`
      : "Start paper test to lock a forecast before the next newly synced result.";
    const allResults = paperState.results;
    // Do not mix pre-upgrade rolling-50 guesses into the adaptive-window model's metrics.
    const results = allResults.filter(r => r && r.modelVersion === "streak-run-v2");
    const runPatternScores = allResults.filter(r => r && r.patternVersion === "run-length-v2");
    const runPatternCalls = runPatternScores.filter(r => (r.runSignal === "P" || r.runSignal === "B") && typeof r.runSignalHit === "boolean");
    const runPatternHits = runPatternCalls.filter(r => r.runSignalHit).length;
    const bandHits = results.filter(r => r.bandHit).length;
    const nearHits = results.filter(r => r.absError <= 0.25).length;
    const errors = results.map(r => r.absError).sort((a,b)=>a-b);
    const medErr = errors.length ? (errors.length%2 ? errors[(errors.length-1)/2] : (errors[errors.length/2-1]+errors[errors.length/2])/2) : NaN;
    const baselineErrors = results.filter(r => Number.isFinite(r.baselineAbsError)).map(r => r.baselineAbsError).sort((a,b)=>a-b);
    const baselineMedErr = baselineErrors.length ? (baselineErrors.length%2 ? baselineErrors[(baselineErrors.length-1)/2] : (baselineErrors[baselineErrors.length/2-1]+baselineErrors[baselineErrors.length/2])/2) : NaN;
    $("paperScoredCount").textContent = results.length.toLocaleString();
    $("paperBandRate").textContent = results.length ? pct(bandHits,results.length) : "N/A";
    $("paperMedianError").textContent = Number.isFinite(medErr) ? fmt(medErr).replace("x","x") : "N/A";
    $("paperNearRate").textContent = results.length ? pct(nearHits,results.length) : "N/A";
    $("paperBaselineError").textContent = Number.isFinite(baselineMedErr) ? fmt(baselineMedErr) : "N/A";
    $("paperBaselineNote").textContent = baselineErrors.length ? `${baselineErrors.length} comparable round(s)` : "Starts with new test rounds";
    $("paperRunPatternRate").textContent = runPatternCalls.length ? pct(runPatternHits,runPatternCalls.length) : "N/A";
    $("paperRunPatternNote").textContent = runPatternCalls.length
      ? `${runPatternHits}/${runPatternCalls.length} directional signal(s) · ${pct(runPatternCalls.length,runPatternScores.length)} of scored rounds`
      : "No directional signals scored yet";
    const bpRows = allResults.filter(r => r && r.runLengthVersion === "run-length-v2" && typeof r.bpHit === "boolean" && Number.isFinite(r.bpBrier));
    const bpHits = bpRows.filter(r => r.bpHit).length;
    const bpBaseHits = bpRows.filter(r => r.bpBaselineHit === true).length;
    const bpBrier = bpRows.length ? bpRows.reduce((s,r)=>s+r.bpBrier,0)/bpRows.length : NaN;
    const bpBaseBrier = bpRows.length ? bpRows.reduce((s,r)=>s+(Number.isFinite(r.bpBaselineBrier)?r.bpBaselineBrier:0),0)/bpRows.length : NaN;
    const lengthRows = allResults.filter(r => r && r.runLengthVersion === "run-length-v2" && typeof r.runLengthHit === "boolean");
    const lengthHits = lengthRows.filter(r => r.runLengthHit).length;
    const lengthBaseHits = lengthRows.filter(r => r.runLengthBaselineHit === true).length;
    $("paperBPAccuracy").textContent = bpRows.length ? pct(bpHits,bpRows.length) : "N/A";
    $("paperBPBaselineAccuracy").textContent = bpRows.length ? pct(bpBaseHits,bpRows.length) : "N/A";
    $("paperBPBrier").textContent = Number.isFinite(bpBrier) ? bpBrier.toFixed(3) : "N/A";
    $("paperBPBrierBaseline").textContent = Number.isFinite(bpBaseBrier) ? bpBaseBrier.toFixed(3) : "N/A";
    $("paperBPCount").textContent = bpRows.length.toLocaleString();
    $("paperRunLengthAccuracy").textContent = lengthRows.length ? pct(lengthHits,lengthRows.length) : "N/A";
    $("paperRunLengthBaseline").textContent = lengthRows.length ? pct(lengthBaseHits,lengthRows.length) : "N/A";
    $("paperRunLengthCount").textContent = lengthRows.length.toLocaleString();
    $("paperBPNote").textContent = bpRows.length ? `${bpHits}/${bpRows.length} B/P forecasts · matched baseline` : "New run-length-v2 records only";
    $("paperRunLengthNote").textContent = lengthRows.length ? `${lengthHits}/${lengthRows.length} resolved runs` : "Scored after each run closes";
    if (results.length) {
      const last = results[results.length-1];
      const baselineText = Number.isFinite(last.baselineAbsError)
        ? `; rolling-50 median baseline ${fmt(last.baselineGuess)}, error ${fmt(last.baselineAbsError)}`
        : "";
      $("paperLastOutcome").textContent = `Last scored result: model estimate ${fmt(last.guess)}, actual ${fmt(last.actual)}, absolute error ${fmt(last.absError)}${baselineText} · band ${last.bandHit?"hit":"miss"}. ${paperState.lastMessage}`;
    } else {
      $("paperLastOutcome").textContent = `No run-length predictor paper-test rounds scored yet. ${allResults.length} earlier-version record(s) remain saved but are excluded from this model version's metrics. Keep both tabs open and wait for a newly synced single round.`;
    }
    $("paperStartButton").textContent = paperState.active
      ? (pending ? "Guess locked" : "Lock next guess")
      : "Start paper test";
    $("paperStartButton").disabled = paperState.active && !!pending;
    $("paperPauseButton").disabled = !paperState.active;
  }

  function settlePaperOnLiveResult(actual, timestamp) {
    if (!paperState.active) return;
    const pending = paperState.pending;
    if (!pending) {
      paperState.skipped += 1;
      paperState.pendingRunForecasts = [];
      paperState.lastMessage = "A result arrived without a locked guess; it was not scored.";
      paperState.pending = makePaperForecast(values());
      savePaperState();
      return;
    }
    const absError = Math.abs(actual - pending.point);
    const baselineAbsError = Number.isFinite(pending.baselinePoint) ? Math.abs(actual - pending.baselinePoint) : NaN;
    const result = {
      guess: pending.point,
      actual,
      absError,
      baselineGuess: pending.baselinePoint,
      baselineAbsError,
      guessBand: pending.band,
      actualBand: outcomeBand(actual),
      bandHit: outcomeBand(actual) === pending.band,
      nearHit: absError <= 0.25,
      guessCreatedAt: pending.createdAt,
      observedAt: timestamp || new Date().toISOString(),
      sampleSize: pending.sampleSize,
      guessWindow: pending.lookbackWindow || 50,
      modelVersion: pending.modelVersion || "legacy_rolling50",
      patternVersion:pending.patternVersion || null,
      runSignal:pending.runSignal || "N",
      runPatternScore:Number.isFinite(pending.runPatternScore)?pending.runPatternScore:null,
      runPatternBaseline:Number.isFinite(pending.runPatternBaseline)?pending.runPatternBaseline:null,
      runPatternContext:pending.runPatternContext || "",
      runPatternSupport:pending.runPatternSupport || 0,
      runPatternDepth:pending.runPatternDepth || 0,
      runSignalHit:(pending.runSignal==="P"||pending.runSignal==="B")
        ? pending.runSignal === (actual >= 2 ? "P" : "B")
        : null,
      forecastId: pending.forecastId || null,
      runLengthVersion: pending.runLengthVersion || null,
      bpForecast: pending.bpForecast || null,
      bpProbability: Number.isFinite(pending.bpProbability) ? pending.bpProbability : null,
      bpBaselineProbability: Number.isFinite(pending.bpBaselineProbability) ? pending.bpBaselineProbability : null,
      bpActual: actual >= 2 ? "P" : "B",
      bpHit: (pending.bpForecast==="P"||pending.bpForecast==="B") ? pending.bpForecast===(actual>=2?"P":"B") : null,
      bpBrier: Number.isFinite(pending.bpProbability) ? Math.pow(pending.bpProbability-(actual>=2?1:0),2) : null,
      bpBaselineHit: Number.isFinite(pending.bpBaselineProbability) ? (pending.bpBaselineProbability>=0.5)===(actual>=2) : null,
      bpBaselineBrier: Number.isFinite(pending.bpBaselineProbability) ? Math.pow(pending.bpBaselineProbability-(actual>=2?1:0),2) : null,
      runCurrentType: pending.runCurrentType || null,
      runCurrentLength: Number.isFinite(pending.runCurrentLength) ? pending.runCurrentLength : null,
      runLengthCategoryGuess: pending.runLengthCategoryGuess || null,
      runLengthDistribution: pending.runLengthDistribution || null,
      runLengthBaselineDistribution: pending.runLengthBaselineDistribution || null,
      runLengthSupport: pending.runLengthSupport || 0,
      runLengthContextSupport: pending.runLengthContextSupport || 0,
      runLengthActualLength: null,
      runLengthActualCategory: null,
      runLengthHit: null,
      runLengthBaselineHit: null
    };
    paperState.results.push(result);
    if (pending.runLengthVersion === "run-length-v2" && (pending.runCurrentType === "B" || pending.runCurrentType === "P")) {
      if ((actual >= 2 ? "P" : "B") === pending.runCurrentType) {
        paperState.pendingRunForecasts = (paperState.pendingRunForecasts || []).filter(f => f.runCurrentType === pending.runCurrentType);
        paperState.pendingRunForecasts.push(pending);
        paperState.pendingRunForecasts = paperState.pendingRunForecasts.slice(-1000);
      } else {
        const actualLength = pending.runCurrentLength;
        const actualCategory = runLengthCategoryForLength(actualLength);
        const forecasts = (paperState.pendingRunForecasts || []).concat([pending]).filter(f => f && f.runLengthVersion === "run-length-v2" && f.runCurrentType === pending.runCurrentType);
        const resultById = new Map(paperState.results.map(r => [r.forecastId,r]));
        for (const forecast of forecasts) {
          const scored = resultById.get(forecast.forecastId);
          if (!scored) continue;
          scored.runLengthActualLength = actualLength;
          scored.runLengthActualCategory = actualCategory;
          scored.runLengthHit = forecast.runLengthCategoryGuess === actualCategory;
          scored.runLengthBaselineHit = forecast.runLengthBaselineDistribution ? runLengthBestCategory(forecast.runLengthBaselineDistribution) === actualCategory : null;
        }
        paperState.pendingRunForecasts = [];
      }
    } else paperState.pendingRunForecasts = [];
    paperState.results = paperState.results.slice(-1000);
    paperState.lastMessage = `Scored round ${paperState.results.length}: model error ${fmt(absError)}, rolling-50 baseline error ${fmt(baselineAbsError)}; ${result.bandHit ? "band hit" : "band miss"}.`;
    paperState.pending = null;
    savePaperState();
  }

  let rounds = loadHistory();

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      return saved.filter(x => x && Number.isFinite(x.multiplier) && x.multiplier >= 1 && typeof x.timestamp === "string").sort((a,b)=>{const ta=Date.parse(a.timestamp),tb=Date.parse(b.timestamp);return (Number.isFinite(ta)?ta:0)-(Number.isFinite(tb)?tb:0);}).slice(-MAX_ROUNDS);
    } catch (_) { return []; }
  }
  function saveHistory() {
    try {
      rounds.sort((a,b)=>{const ta=Date.parse(a.timestamp),tb=Date.parse(b.timestamp);return (Number.isFinite(ta)?ta:0)-(Number.isFinite(tb)?tb:0);});
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
    const newlyAdded = [];
    const existingIds = new Set(rounds.map(r => r.extensionId).filter(Boolean));
    for (const item of message.rounds) {
      if (!item || typeof item.id !== "string" || existingIds.has(item.id)) continue;
      const multiplier = Number(item.multiplier);
      if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 1000000) continue;
      const parsedTime = Date.parse(item.timestamp || "");
      const observedTimestamp = Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString();
      rounds.push({
        multiplier,
        timestamp: observedTimestamp,
        extensionId: item.id,
        source: "Chrome extension auto-sync"
      });
      newlyAdded.push({multiplier,timestamp:observedTimestamp});
      existingIds.add(item.id);
      added++;
      if (rounds.length >= MAX_ROUNDS) break;
    }
    if (added) {
      rounds = rounds.slice(-MAX_ROUNDS);
      if (paperState.active && newlyAdded.length) {
        if (newlyAdded.length === 1) {
          // Score the forecast that was locked before this newly observed completed result.
          settlePaperOnLiveResult(newlyAdded[0].multiplier,newlyAdded[0].timestamp);
        } else {
          // A batch cannot be safely aligned one-by-one to pending forecasts.
          paperState.skipped += newlyAdded.length;
          paperState.pending = null;
          paperState.pendingRunForecasts = [];
          paperState.lastMessage = `Skipped scoring a batch of ${newlyAdded.length} results because the individual round-to-guess order was ambiguous.`;
        }
        if (paperState.active) paperState.pending = null;
        savePaperState();
      }
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

  function receiveFairnessSync(message) {
    const statusNode = $("pfAutoCaptureStatus");
    const records = Array.isArray(message.rounds)
      ? message.rounds.filter(r => r && typeof r.id === "string" && typeof r.serverSeed === "string" &&
          Array.isArray(r.clientSeeds) && r.clientSeeds.length === 3 &&
          typeof r.hash === "string" && Number.isFinite(Number(r.multiplier)))
      : [];
    const ackIds = Array.isArray(message.rounds) ? message.rounds.map(r => r && r.id).filter(Boolean) : [];
    if (ackIds.length) {
      window.postMessage({
        source: "aviator-lab-page-v07",
        type: "AUTO_FAIRNESS_ACK",
        ids: ackIds
      }, window.location.origin);
    }
    if (!records.length) {
      if (statusNode && message.status && message.status.message) {
        statusNode.textContent = "Extension connected · " + message.status.message;
      }
      return;
    }
    records.sort((a,b) => Date.parse(a.capturedAt || 0) - Date.parse(b.capturedAt || 0));
    const latest = records[records.length - 1];
    $("pfServerSeed").value = latest.serverSeed;
    $("pfClientSeed1").value = latest.clientSeeds[0];
    $("pfClientSeed2").value = latest.clientSeeds[1];
    $("pfClientSeed3").value = latest.clientSeeds[2];
    $("pfDisplayedMultiplier").value = String(latest.multiplier);
    $("pfDisplayedHash").value = latest.hash;
    $("pfServerCommitment").value = latest.serverCommitment || "";
    if (statusNode) {
      statusNode.textContent = "Extension captured completed round " + (latest.roundId || "(ID unavailable)") +
        " at " + (latest.capturedAt ? new Date(latest.capturedAt).toLocaleTimeString() : "an unknown time") +
        ". Fields are filled automatically; verifying locally now.";
    }
    $("pfVerifierForm").dispatchEvent(new Event("submit", {bubbles:true,cancelable:true}));
  }

  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const message = event.data;
    if (message && message.source === "aviator-lab-extension-v12" && message.type === "AUTO_FAIRNESS_SYNC") {
      receiveFairnessSync(message);
      return;
    }
    if (message && ["aviator-lab-extension-v05", "aviator-lab-extension-v06", "aviator-lab-extension-v07", "aviator-lab-extension-v08", "aviator-lab-extension-v09", "aviator-lab-extension-v10", "aviator-lab-extension-v11", "aviator-lab-extension-v12"].includes(message.source) && message.type === "AUTO_ROUND_SYNC") {
      receiveAutoSync(message);
      window.postMessage({
        source: "aviator-lab-page-v06",
        type: "AUTO_SYNC_ACK",
        ids: Array.isArray(message.rounds) ? message.rounds.map(item => item && item.id).filter(Boolean) : []
      }, window.location.origin);
    }
  });


  // Completed-round Provably Fair verifier. All hashing happens locally via Web Crypto.
  async function digestHex(algorithm, value) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("Secure Web Crypto is unavailable. Open this tool over HTTPS in a modern browser.");
    }
    const bytes = await window.crypto.subtle.digest(algorithm, new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  }

  function multiplierFromHash(hash) {
    const prefix = hash.slice(0, 13).toLowerCase();
    const h = BigInt("0x" + prefix);
    const e = 1n << 52n;
    if (h >= e) throw new Error("The 13-character hash value is outside the expected 52-bit range.");
    let cents = (97n * e) / (e - h);
    if (cents < 100n) cents = 100n;
    const multiplierText = (cents / 100n).toString() + "." + (cents % 100n).toString().padStart(2, "0");
    return {prefix, decimal:h.toString(), cents, multiplierText};
  }

  function setVerifierStatus(id, value, kind) {
    const node = $(id);
    node.textContent = value;
    node.classList.remove("verify-match", "verify-mismatch", "verify-neutral");
    node.classList.add(kind || "verify-neutral");
  }

  function resetVerifierOutput() {
    setVerifierStatus("pfOverallStatus", "Enter the exact seeds, combined hash and finished multiplier, then verify.", "verify-neutral");
    setVerifierStatus("pfCalculatedHashStatus", "Not checked", "verify-neutral");
    $("pfCalculatedHashNote").textContent = "Seed concatenation in panel order, with no separators";
    $("pfCalculatedHashValue").textContent = "N/A";
    $("pfHexPrefix").textContent = "N/A";
    $("pfHexDecimal").textContent = "N/A";
    $("pfHashMultiplier").textContent = "N/A";
    $("pfSeedMultiplier").textContent = "N/A";
    setVerifierStatus("pfCommitmentStatus", "Not provided", "verify-neutral");
    $("pfCommitmentNote").textContent = "Optional SHA-256 cross-check";
  }

  async function verifyCompletedRound(event) {
    event.preventDefault();
    const button = $("pfVerifyButton");
    button.disabled = true;
    button.textContent = "Verifying locally…";
    resetVerifierOutput();
    try {
      const serverSeed = $("pfServerSeed").value.trim();
      const clientSeeds = [
        $("pfClientSeed1").value.trim(),
        $("pfClientSeed2").value.trim(),
        $("pfClientSeed3").value.trim()
      ];
      const shownHash = $("pfDisplayedHash").value.replace(/\s+/g, "").toLowerCase();
      const displayedMultiplier = Number($("pfDisplayedMultiplier").value);
      const commitment = $("pfServerCommitment").value.replace(/\s+/g, "").toLowerCase();

      if (!serverSeed || clientSeeds.some(seed => !seed)) {
        throw new Error("Enter the complete server seed and all three client seeds exactly as shown.");
      }
      if (!/^[0-9a-f]{128}$/.test(shownHash)) {
        throw new Error("The combined SHA-512 hash must be exactly 128 hexadecimal characters.");
      }
      if (!Number.isFinite(displayedMultiplier) || displayedMultiplier < 1 || displayedMultiplier > 1000000) {
        throw new Error("Enter the finished multiplier shown by the game, such as 2.78.");
      }
      if (commitment && !/^[0-9a-f]{64}$/.test(commitment)) {
        throw new Error("The optional server-seed SHA-256 commitment must be 64 hexadecimal characters.");
      }

      // SPRIBE's guide illustrates concatenation without separators in panel order.
      const concatenatedSeeds = serverSeed + clientSeeds.join("");
      const computedHash = await digestHex("SHA-512", concatenatedSeeds);
      const hashMatches = computedHash === shownHash;
      const fromShownHash = multiplierFromHash(shownHash);
      const fromComputedHash = multiplierFromHash(computedHash);
      const expectedCents = BigInt(Math.round(displayedMultiplier * 100));
      const displayedResultMatches = fromShownHash.cents === expectedCents;
      const seedDerivedResultMatches = fromComputedHash.cents === expectedCents;

      setVerifierStatus(
        "pfCalculatedHashStatus",
        hashMatches ? "EXACT MATCH" : "MISMATCH",
        hashMatches ? "verify-match" : "verify-mismatch"
      );
      $("pfCalculatedHashNote").textContent = hashMatches
        ? "Recalculated SHA-512 equals the hash copied from the finished round."
        : "The values do not reproduce the shown hash. Recheck every seed character and panel order.";
      $("pfCalculatedHashValue").textContent = computedHash;
      $("pfHexPrefix").textContent = fromShownHash.prefix;
      $("pfHexDecimal").textContent = fromShownHash.decimal;
      $("pfHashMultiplier").textContent = fromShownHash.multiplierText + "x" + (displayedResultMatches ? " · MATCH" : " · DIFFERS");
      $("pfSeedMultiplier").textContent = fromComputedHash.multiplierText + "x" + (seedDerivedResultMatches ? " · MATCH" : " · DIFFERS");

      let commitmentMatches = null;
      if (commitment) {
        const computedCommitment = await digestHex("SHA-256", serverSeed);
        commitmentMatches = computedCommitment === commitment;
        setVerifierStatus(
          "pfCommitmentStatus",
          commitmentMatches ? "MATCH" : "MISMATCH",
          commitmentMatches ? "verify-match" : "verify-mismatch"
        );
        $("pfCommitmentNote").textContent = commitmentMatches
          ? "SHA-256 of this revealed server seed matches the supplied commitment."
          : "The server seed does not match the supplied commitment. Confirm that it belongs to this same round.";
      } else {
        setVerifierStatus("pfCommitmentStatus", "Not provided", "verify-neutral");
        $("pfCommitmentNote").textContent = "Optional: compare against the commitment saved before this exact round.";
      }

      if (!hashMatches) {
        setVerifierStatus("pfOverallStatus", "NOT VERIFIED: the entered seeds do not reproduce the displayed SHA-512 hash. Check the exact seed strings and their order. The multiplier calculation below is only a reference check, not evidence the round is verified.", "verify-mismatch");
      } else if (commitmentMatches === false) {
        setVerifierStatus("pfOverallStatus", "WARNING: the combined SHA-512 matches, but the server seed does not match the supplied pre-round SHA-256 commitment. Confirm the commitment belongs to this same round before drawing conclusions.", "verify-mismatch");
      } else if (!displayedResultMatches) {
        setVerifierStatus("pfOverallStatus", "The seed chain reproduces the displayed SHA-512 hash, but the displayed multiplier differs from the common 97% reference formula. This alone does not prove manipulation; the game build/formula or entered value may differ.", "verify-neutral");
      } else if (commitmentMatches === true) {
        setVerifierStatus("pfOverallStatus", "MATCH: the seed chain reproduces the combined SHA-512 hash, the result matches the 97% reference calculation, and the supplied server-seed commitment also matches. This verifies only this completed round.", "verify-match");
      } else {
        setVerifierStatus("pfOverallStatus", "MATCH: the seed chain reproduces the combined SHA-512 hash and the displayed result matches the common 97% reference calculation. This verifies only this completed round; no next-round prediction is made.", "verify-match");
      }
    } catch (error) {
      setVerifierStatus("pfOverallStatus", error && error.message ? error.message : "Could not verify the entered values.", "verify-mismatch");
    } finally {
      button.disabled = false;
      button.textContent = "Verify finished round";
    }
  }

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




  function runLengthRunsForHistory(history) {
    const runs=[];
    for(let i=0;i<history.length;i++){const type=history[i]>=2?"P":"B",last=runs[runs.length-1];if(last&&last.type===type){last.len++;last.end=i;}else runs.push({type,len:1,start:i,end:i});}
    return runs;
  }
  function runLengthCategoryForLength(length){return length<=1?"1":length===2?"2":length===3?"3":"4+";}
  function runLengthBucketForRun(run){return run.type+runLengthCategoryForLength(run.len);}
  function runLengthExactLabel(run){return run.type+String(run.len);}
  function runLengthBestCategory(distribution){return ["1","2","3","4+"].reduce((best,k)=>(distribution[k]||0)>(distribution[best]||0)?k:best,"1");}
  function estimateRunLengthDistribution(history){
    const runs=runLengthRunsForHistory(history),empty={"1":0.25,"2":0.25,"3":0.25,"4+":0.25};
    if(!runs.length)return {distribution:empty,baselineDistribution:empty,guess:"N/A",support:0,contextSupport:0,contextDepth:0,currentType:"N",currentLength:0};
    const current=runs[runs.length-1],complete=runs.slice(0,-1),allowed=["1","2","3","4+"].filter(cat=>(cat==="4+"?4:Number(cat))>=current.len),permitted=allowed.length?allowed:["4+"];
    const countsFor=pool=>{const counts={"1":0,"2":0,"3":0,"4+":0};for(const run of pool){if(run.len<current.len)continue;const cat=runLengthCategoryForLength(run.len);if(permitted.includes(cat))counts[cat]++;}return counts;};
    const typePool=complete.filter(run=>run.type===current.type&&run.len>=current.len);let basePool=typePool.length?typePool:complete.filter(run=>run.len>=current.len);if(!basePool.length)basePool=complete;
    const priorCounts=countsFor(basePool),priorTotal=permitted.reduce((sum,cat)=>sum+priorCounts[cat],0),denom=priorTotal+permitted.length;
    const baselineDistribution={"1":0,"2":0,"3":0,"4+":0};for(const cat of permitted)baselineDistribution[cat]=(priorCounts[cat]+1)/denom;
    const recentContext=runs.slice(0,-1).slice(-3).map(runLengthBucketForRun);let matchedRuns=[],contextDepth=0,context="";
    for(let depth=Math.min(3,recentContext.length);depth>=1;depth--){const wanted=recentContext.slice(-depth),matches=[];
      for(let i=depth;i<complete.length;i++){const candidate=complete[i];if(candidate.type!==current.type||candidate.len<current.len)continue;const preceding=complete.slice(i-depth,i).map(runLengthBucketForRun);if(preceding.every((c,j)=>c===wanted[j]))matches.push(candidate);}
      if(matches.length>=5){matchedRuns=matches;contextDepth=depth;context=wanted.join(" → ");break;}}
    const distribution={"1":0,"2":0,"3":0,"4+":0};
    if(matchedRuns.length){const matchedCounts=countsFor(matchedRuns),shrink=8;for(const cat of permitted)distribution[cat]=(matchedCounts[cat]+shrink*baselineDistribution[cat])/(matchedRuns.length+shrink);}
    else for(const cat of permitted)distribution[cat]=baselineDistribution[cat];
    const sum=permitted.reduce((a,k)=>a+distribution[k],0)||1;for(const cat of permitted)distribution[cat]/=sum;
    return {distribution,baselineDistribution,guess:runLengthBestCategory(distribution),support:typePool.length,contextSupport:matchedRuns.length,contextDepth,context:context||"No context met the 5-match threshold",currentType:current.type,currentLength:current.len};
  }
  function calculateRunLengthSignal(history,options){
    options=options||{};const n=history.length,emptyDist={"1":0.25,"2":0.25,"3":0.25,"4+":0.25};
    const empty={probability:0.5,baselineProbability:0.5,signal:"N",forecastType:"B",support:0,depth:0,context:"N/A",holdoutN:0,holdoutHits:0,baselineHits:0,signalN:0,signalHits:0,holdoutAccuracy:NaN,baselineAccuracy:NaN,signalAccuracy:NaN,signalCoverage:NaN,brierScore:NaN,baselineBrierScore:NaN,supportedPredictions:0,currentRunLabel:"N/A",currentRunType:"N",currentRunLength:0,currentRunStart:-1,recentPayRate:NaN,runLengthDistribution:emptyDist,runLengthBaselineDistribution:emptyDist,runLengthGuess:"N/A",runLengthSupport:0,runLengthContextSupport:0,runLengthContextDepth:0,runLengthHoldoutN:0,runLengthHoldoutHits:0,runLengthBaselineHits:0,runLengthAccuracy:NaN,runLengthBaselineAccuracy:NaN,runLengthSupported:0,runLengthFrequencySummary:"No completed runs",exactRunFrequencies:[],patternMatches:[]};
    if(!n)return empty;
    const runs=runLengthRunsForHistory(history),prefixKeys=Array.from({length:n+1},()=>Array(5).fill("")),stack=[];
    const pushRun=v=>{const type=v>=2?"P":"B",last=stack[stack.length-1];if(last&&last.type===type)last.len++;else stack.push({type,len:1});};
    for(let i=0;i<=n;i++){for(let k=1;k<=4;k++)if(stack.length>=k)prefixKeys[i][k]=stack.slice(-k).map(runLengthBucketForRun).join("|");if(i<n)pushRun(history[i]);}
    const maps={1:new Map(),2:new Map(),3:new Map(),4:new Map()};let observed=0,pays=0,holdoutN=0,holdoutHits=0,baselineHits=0,signalN=0,signalHits=0,brierSum=0,baselineBrierSum=0,supportedPredictions=0;
    const holdoutStart=n>=40?Math.floor(n*0.70):n;
    const choose=(keys,base)=>{for(let k=4;k>=1;k--){const key=keys[k],rec=key?maps[k].get(key):null;if(rec&&rec.n>=8){const shrink=12;return {probability:(rec.pays+shrink*base)/(rec.n+shrink),baselineProbability:base,support:rec.n,depth:k,key};}}return {probability:base,baselineProbability:base,support:0,depth:0,key:""};};
    for(let i=0;i<n;i++){const base=(pays+1)/(observed+2),pred=choose(prefixKeys[i],base),actual=history[i]>=2?1:0;
      if(i>=holdoutStart){holdoutN++;if((pred.probability>=0.5?1:0)===actual)holdoutHits++;if((base>=0.5?1:0)===actual)baselineHits++;brierSum+=(pred.probability-actual)**2;baselineBrierSum+=(base-actual)**2;if(pred.support>=8)supportedPredictions++;if(pred.support>=8&&Math.abs(pred.probability-base)>=0.04){signalN++;if((pred.probability>base?1:0)===actual)signalHits++;}}
      for(let k=1;k<=4;k++){const key=prefixKeys[i][k];if(!key)continue;const rec=maps[k].get(key)||{n:0,pays:0};rec.n++;rec.pays+=actual;maps[k].set(key,rec);}observed++;pays+=actual;}
    const baselineProbability=(pays+1)/(observed+2),current=choose(prefixKeys[n],baselineProbability);let signal="N";if(current.support>=8&&current.probability>=baselineProbability+0.04)signal="P";else if(current.support>=8&&current.probability<=baselineProbability-0.04)signal="B";
    const currentRun=runs[runs.length-1],lengthModel=estimateRunLengthDistribution(history),recent=history.slice(-Math.min(50,n)),completed=runs.slice(0,-1),recentPayRate=recent.filter(v=>v>=2).length/recent.length;
    const exactCounts=new Map();for(const run of completed){const label=runLengthExactLabel(run);exactCounts.set(label,(exactCounts.get(label)||0)+1);}
    const exactRunFrequencies=Array.from(exactCounts.entries()).map(([label,count])=>({label,count})).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
    const runLengthFrequencySummary=exactRunFrequencies.length?exactRunFrequencies.map(x=>x.label+" × "+x.count).join(" · "):"No completed runs yet";
    const patternMatches=[];
    if(!options.skipHistoryPatternMatches)for(let depth=Math.min(4,completed.length);depth>=1;depth--){const pat=completed.slice(-depth).map(runLengthBucketForRun),counts=new Map();let matches=0;
      for(let end=depth;end<completed.length;end++){const before=completed.slice(end-depth,end).map(runLengthBucketForRun);if(!pat.every((x,j)=>x===before[j]))continue;const next=runLengthBucketForRun(completed[end]);counts.set(next,(counts.get(next)||0)+1);matches++;}
      if(matches){const order=["B1","B2","B3","B4+","P1","P2","P3","P4+"],followSummary=order.filter(x=>counts.has(x)).map(x=>x+": "+counts.get(x)).join(" · "),b=Array.from(counts).filter(([k])=>k[0]==="B").reduce((s,[,v])=>s+v,0),p=Array.from(counts).filter(([k])=>k[0]==="P").reduce((s,[,v])=>s+v,0);patternMatches.push({depth,pattern:pat.join(" → "),matches,followSummary,bpSummary:"B "+b+" / P "+p});}}
    let runLengthHoldoutN=0,runLengthHoldoutHits=0,runLengthBaselineHits=0,runLengthSupported=0;
    if(!options.skipValidation&&holdoutN)for(const run of completed){if(run.start<holdoutStart)continue;const est=estimateRunLengthDistribution(history.slice(0,run.start+1)),actual=runLengthCategoryForLength(run.len);if(runLengthBestCategory(est.distribution)===actual)runLengthHoldoutHits++;if(runLengthBestCategory(est.baselineDistribution)===actual)runLengthBaselineHits++;if(est.contextSupport>=5)runLengthSupported++;runLengthHoldoutN++;}
    return {probability:current.probability,baselineProbability,signal,forecastType:current.probability>=0.5?"P":"B",support:current.support,depth:current.depth,matchedContext:current.key,context:runs.slice(-8).map(runLengthExactLabel).join(" → "),currentRunLabel:runLengthExactLabel(currentRun),currentRunType:currentRun.type,currentRunLength:currentRun.len,currentRunStart:currentRun.start,recentPayRate,
      holdoutN,holdoutHits,baselineHits,signalN,signalHits,holdoutAccuracy:holdoutN?holdoutHits/holdoutN:NaN,baselineAccuracy:holdoutN?baselineHits/holdoutN:NaN,signalAccuracy:signalN?signalHits/signalN:NaN,signalCoverage:holdoutN?signalN/holdoutN:NaN,brierScore:holdoutN?brierSum/holdoutN:NaN,baselineBrierScore:holdoutN?baselineBrierSum/holdoutN:NaN,supportedPredictions,
      runLengthDistribution:lengthModel.distribution,runLengthBaselineDistribution:lengthModel.baselineDistribution,runLengthGuess:lengthModel.guess,runLengthSupport:lengthModel.support,runLengthContextSupport:lengthModel.contextSupport,runLengthContextDepth:lengthModel.contextDepth,runLengthContext:lengthModel.context,runLengthHoldoutN,runLengthHoldoutHits,runLengthBaselineHits,runLengthAccuracy:runLengthHoldoutN?runLengthHoldoutHits/runLengthHoldoutN:NaN,runLengthBaselineAccuracy:runLengthHoldoutN?runLengthBaselineHits/runLengthHoldoutN:NaN,runLengthSupported,runLengthFrequencySummary,exactRunFrequencies,patternMatches};
  }
  function calculatePatternGuess(history, runPattern) {
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

    // Blend a separate B/P streak-context score into the four multiplier bands.
    const streakModel = runPattern || calculateRunLengthSignal(history,{skipValidation:true,skipHistoryPatternMatches:true});
    if(streakModel.support >= 8) {
      const highTotal = scores[1] + scores[2] + scores[3];
      const highParts = highTotal > 0 ? scores.slice(1).map(v=>v/highTotal) : [1/3,1/3,1/3];
      const runDistribution = [1-streakModel.probability,
        highParts[0]*streakModel.probability,
        highParts[1]*streakModel.probability,
        highParts[2]*streakModel.probability];
      const streakWeight = 0.22;
      for(let b=0;b<4;b++) scores[b] = scores[b]*(1-streakWeight) + runDistribution[b]*streakWeight;
    }
    let top=0;
    for(let b=1;b<4;b++) if(scores[b]>scores[top]) top=b;
    const valuesInBand=history.filter(v=>outcomeBand(v)===top);
    const bandMedian=valuesInBand.length?median(valuesInBand):NaN;

    // Numeric point estimates are scored under absolute error, whose robust
    // historical benchmark is the median of unfiltered recent outcomes.
    // Do not condition the numeric estimate on the most-likely band: that
    // can artificially push it low when a high result lands.
    const numericPool=history.slice(-Math.min(50,n));
    const numericGuess=numericPool.length?Math.round(median(numericPool)*100)/100:NaN;
    const numericSource=`median of all ${numericPool.length} multipliers in the last ${numericPool.length} saved rounds (rolling median)`;
    const numericConfidence=n<50?"LOW · fewer than 50 saved rounds":"LOW · rolling-median baseline, not a validated forecast";
    const support=(transitionCount>=3?transitionCount:0)+(motif?motif.hits:0)+(runHits>=3?runHits:0);
    return {
      top,scores,names,support,motifLength:motif?.length||0,motifHits:motif?.hits||0,
      transitionCount,currentStreak,recentSequence:seq.slice(-4).map(b=>names[b]),
      lastBand,bandMedian,numericGuess,numericSource,numericConfidence,
      status:n<20?"BUILDING SAMPLE":n<100?"EARLY SAMPLE":"PATTERN TEST",
      runHits,cappedRun,runPattern:streakModel
    };
  }

  // Small supervised ML experiment: multinomial logistic regression trained in-browser.
  // Features use only the history available before each target round.
  function mlFeatures(history) {
    const seq = history.map(outcomeBand);
    const n = seq.length;
    const f = [1];
    for (let lag = 1; lag <= 4; lag++) {
      const b = n - lag >= 0 ? seq[n - lag] : -1;
      for (let k = 0; k < 4; k++) f.push(b === k ? 1 : 0);
    }
    let streak = 0;
    if (n) {
      for (let i = n - 1; i >= 0 && seq[i] === seq[n - 1]; i--) streak++;
    }
    f.push(Math.min(streak, 6) / 6);
    for (const windowSize of [10, 30]) {
      const slice = seq.slice(-Math.min(windowSize, n));
      const counts = [0, 0, 0, 0];
      slice.forEach(b => counts[b]++);
      for (let k = 0; k < 4; k++) f.push(slice.length ? counts[k] / slice.length : 0.25);
    }
    const last10 = history.slice(-10);
    const last30 = history.slice(-30);
    const med10 = median(last10);
    const med30 = median(last30);
    const mean10 = last10.length ? last10.reduce((a,b)=>a+b,0)/last10.length : NaN;
    f.push(Number.isFinite(med10) ? Math.log1p(med10) / 14 : 0);
    f.push(Number.isFinite(med30) ? Math.log1p(med30) / 14 : 0);
    f.push(Number.isFinite(mean10) ? Math.log1p(mean10) / 14 : 0);
    return f;
  }

  function fitLocalML(history, endIndex) {
    const classCount = 4;
    const featureCount = mlFeatures(history.slice(0, Math.min(history.length, Math.max(1, endIndex)))).length;
    const weights = Array.from({length:classCount},()=>Array(featureCount).fill(0));
    const first = Math.max(25, endIndex - 600);
    const examples = [];
    for (let i = first; i < endIndex; i++) {
      examples.push({x:mlFeatures(history.slice(0,i)),y:outcomeBand(history[i])});
    }
    if (examples.length < 10) return {weights,examples:examples.length,featureCount,ready:false};
    // Full-batch softmax regression with L2 regularization and bounded gradient steps.
    const epochs = 90, learningRate = 0.16, lambda = 0.025;
    for (let epoch = 0; epoch < epochs; epoch++) {
      const grad = Array.from({length:classCount},()=>Array(featureCount).fill(0));
      for (const ex of examples) {
        const logits = weights.map(row=>row.reduce((sum,w,j)=>sum+w*ex.x[j],0));
        const maxLogit = Math.max(...logits);
        const exp = logits.map(v=>Math.exp(Math.max(-30,Math.min(30,v-maxLogit))));
        const denom = exp.reduce((a,b)=>a+b,0) || 1;
        for (let c = 0; c < classCount; c++) {
          const error = exp[c]/denom - (ex.y===c?1:0);
          for (let j = 0; j < featureCount; j++) grad[c][j] += error*ex.x[j];
        }
      }
      for (let c = 0; c < classCount; c++) {
        for (let j = 0; j < featureCount; j++) {
          const regularizer = j === 0 ? 0 : lambda*weights[c][j];
          const g = grad[c][j]/examples.length + regularizer;
          weights[c][j] -= learningRate*Math.max(-2,Math.min(2,g));
        }
      }
    }
    return {weights,examples:examples.length,featureCount,ready:true};
  }

  function predictLocalML(fit, history) {
    const labels = ["1.00x–1.99x","2.00x–4.99x","5.00x–9.99x","10.00x+"];
    if (!fit || !fit.ready || !history.length) return {top:0,probs:[0.25,0.25,0.25,0.25],labels,ready:false};
    const x = mlFeatures(history);
    const logits = fit.weights.map(row=>row.reduce((sum,w,j)=>sum+w*x[j],0));
    const maxLogit = Math.max(...logits);
    const exp = logits.map(v=>Math.exp(Math.max(-30,Math.min(30,v-maxLogit))));
    const total = exp.reduce((a,b)=>a+b,0) || 1;
    const probs = exp.map(v=>v/total);
    let top = 0;
    for (let i=1;i<probs.length;i++) if(probs[i]>probs[top]) top=i;
    return {top,probs,labels,ready:true};
  }


  // Numeric supervised regression experiment. The target is log-scaled to reduce
  // domination by rare very large multipliers. This remains a historical-only model.
  function fitLocalRegression(history, endIndex) {
    const limit = Math.min(history.length, Math.max(0, endIndex));
    const featureCount = mlFeatures(history.slice(0, Math.max(1,limit))).length;
    const weights = Array(featureCount).fill(0);
    const first = Math.max(30, limit - 600);
    const examples = [];
    const targetScale = Math.log1p(1000);
    for (let i = first; i < limit; i++) {
      const actual = history[i];
      if (!Number.isFinite(actual) || actual < 1) continue;
      examples.push({
        x: mlFeatures(history.slice(0,i)),
        y: Math.log1p(Math.min(actual,1000)) / targetScale
      });
    }
    if (examples.length < 20) return {weights,examples:examples.length,featureCount,ready:false};
    const epochs = 180, learningRate = 0.08, lambda = 0.035;
    for (let epoch = 0; epoch < epochs; epoch++) {
      const grad = Array(featureCount).fill(0);
      for (const ex of examples) {
        const prediction = weights.reduce((sum,w,j)=>sum+w*ex.x[j],0);
        const error = Math.max(-0.5,Math.min(0.5,prediction-ex.y));
        for (let j = 0; j < featureCount; j++) grad[j] += error*ex.x[j];
      }
      for (let j = 0; j < featureCount; j++) {
        const regularizer = j === 0 ? 0 : lambda*weights[j];
        const g = grad[j]/examples.length + regularizer;
        weights[j] -= learningRate*Math.max(-1,Math.min(1,g));
      }
    }
    return {weights,examples:examples.length,featureCount,ready:true};
  }

  function predictLocalRegression(fit, history) {
    if (!fit || !fit.ready || !history.length) return NaN;
    const x = mlFeatures(history);
    const normalizedLog = fit.weights.reduce((sum,w,j)=>sum+w*x[j],0);
    const scale = Math.log1p(1000);
    const clipped = Math.max(Math.log1p(1)/scale,Math.min(1,normalizedLog));
    return Math.round((Math.expm1(clipped*scale))*100)/100;
  }

  function medianAbsoluteError(errors) {
    if (!errors.length) return NaN;
    return median(errors);
  }

  // Select a robust point-estimate lookback on an early chronological development set.
  // The later 30% of one-step forecasts is never used to choose the window.
  function selectAdaptivePointEstimate(history) {
    const candidates = [10,20,30,40,50,75,100,150,200,300];
    const n = history.length;
    const fallbackWindow = Math.min(50,n);
    const fallbackValue = n ? median(history.slice(-fallbackWindow)) : NaN;
    const distributionFor = windowSize => {
      const sample = history.slice(-Math.min(windowSize,n));
      const counts = [0,0,0,0];
      sample.forEach(value => counts[outcomeBand(value)]++);
      const z = 1.96;
      return counts.map((count,band) => {
        const sampleSize = sample.length;
        if (!sampleSize) return {band,count,share:0,lower:0,upper:1,sampleSize:0};
        const p = count/sampleSize;
        const den = 1 + z*z/sampleSize;
        const center = (p + z*z/(2*sampleSize))/den;
        const margin = z*Math.sqrt(p*(1-p)/sampleSize + z*z/(4*sampleSize*sampleSize))/den;
        return {band,count,share:p,lower:Math.max(0,center-margin),upper:Math.min(1,center+margin),sampleSize};
      });
    };
    if (n < 160) {
      return {ready:false,window:fallbackWindow,value:fallbackValue,developmentCount:0,holdoutCount:0,
        holdoutMedianError:NaN,baselineMedianError:NaN,holdoutMAE:NaN,baselineMAE:NaN,
        distribution:distributionFor(fallbackWindow)};
    }
    const warmup = Math.min(50,Math.max(30,Math.floor(n*0.12)));
    // Bound work when users have thousands of saved rounds; all prediction rows remain chronological.
    const step = Math.max(1,Math.ceil(n/1200));
    const rows = [];
    for (let i=warmup;i<n;i+=step) {
      const predictions = Object.create(null);
      for (const windowSize of candidates) {
        predictions[windowSize] = median(history.slice(Math.max(0,i-windowSize),i));
      }
      rows.push({actual:history[i],predictions});
    }
    const split = Math.floor(rows.length*0.70);
    const development = rows.slice(0,split);
    const holdout = rows.slice(split);
    if (development.length < 40 || holdout.length < 20) {
      return {ready:false,window:fallbackWindow,value:fallbackValue,developmentCount:development.length,holdoutCount:holdout.length,
        holdoutMedianError:NaN,baselineMedianError:NaN,holdoutMAE:NaN,baselineMAE:NaN};
    }
    const candidatesScored = candidates.map(windowSize => {
      const errors = development.map(row => Math.abs(row.actual-row.predictions[windowSize]));
      return {window:windowSize,medianError:median(errors),meanError:errors.reduce((a,b)=>a+b,0)/errors.length};
    });
    candidatesScored.sort((a,b) =>
      (a.medianError-b.medianError) ||
      (a.meanError-b.meanError) ||
      (Math.abs(a.window-50)-Math.abs(b.window-50))
    );
    const selectedWindow = candidatesScored[0].window;
    const modelErrors = holdout.map(row => Math.abs(row.actual-row.predictions[selectedWindow]));
    const baselineErrors = holdout.map(row => Math.abs(row.actual-row.predictions[50]));
    const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : NaN;
    return {
      ready:true,
      window:selectedWindow,
      value:median(history.slice(-Math.min(selectedWindow,n))),
      developmentCount:development.length,
      holdoutCount:holdout.length,
      holdoutMedianError:median(modelErrors),
      baselineMedianError:median(baselineErrors),
      holdoutMAE:mean(modelErrors),
      baselineMAE:mean(baselineErrors),
      distribution:distributionFor(selectedWindow)
    };
  }

  function renderLocalML(vals, pointEstimate) {
    const bandNode = $("localMLBand");
    if (!bandNode) return;
    const n = vals.length;
    const fit = fitLocalML(vals,n);
    const current = predictLocalML(fit,vals);
    $("localMLStatus").textContent = fit.ready ? "TRAINED IN THIS BROWSER" : "NEED MORE HISTORY";
    $("localMLBand").textContent = n ? current.labels[current.top] : "N/A";
    $("localMLScore").textContent = n && current.ready ? (current.probs[current.top]*100).toFixed(1)+"%" : "N/A";
    $("localMLExamples").textContent = fit.examples.toLocaleString();
    for(let k=0;k<4;k++) {
      $("localMLP"+k).textContent = current.ready ? (current.probs[k]*100).toFixed(1)+"%" : "N/A";
      $("localMLBar"+k).style.width = current.ready ? (current.probs[k]*100).toFixed(1)+"%" : "0%";
    }

    // Separate chronological validation: fit only on the earlier segment,
    // then keep weights frozen across the final unseen segment.
    const minTrainIndex = Math.min(30,Math.max(25,Math.floor(n*0.25)));
    const warmup = Math.min(30,Math.max(12,Math.floor(n*0.35)));
    const allRows = [];
    for(let i=warmup;i<n;i++) allRows.push(i);
    const holdoutCount = allRows.length >= 10 ? Math.max(5,Math.ceil(allRows.length*0.30)) : Math.max(0,Math.ceil(allRows.length*0.30));
    const testStart = allRows.length ? allRows[allRows.length-holdoutCount] : n;
    const testFit = fitLocalML(vals,testStart);
    let mlHits=0, baselineHits=0, testN=0;
    for(let i=testStart;i<n;i++) {
      const guess = predictLocalML(testFit,vals.slice(0,i));
      const actual = outcomeBand(vals[i]);
      const counts=[1,1,1,1];
      vals.slice(0,i).forEach(v=>counts[outcomeBand(v)]++);
      let base=0;
      for(let j=1;j<4;j++) if(counts[j]>counts[base]) base=j;
      if(guess.ready && guess.top===actual) mlHits++;
      if(base===actual) baselineHits++;
      testN++;
    }
    $("localMLHoldout").textContent = testN && testFit.ready ? `${mlHits}/${testN} (${(100*mlHits/testN).toFixed(1)}%)` : "N/A";
    $("localMLBaseline").textContent = testN ? `${baselineHits}/${testN} (${(100*baselineHits/testN).toFixed(1)}%)` : "N/A";
    const delta = testN && testFit.ready ? 100*(mlHits-baselineHits)/testN : NaN;
    $("localMLVerdict").textContent = Number.isFinite(delta)
      ? (delta>0 ? "+" : "")+delta.toFixed(1)+" pp vs baseline"
      : "Not enough validation data";
    $("localMLExplanation").textContent = !fit.ready
      ? "Need at least 35 completed rounds before training this supervised model."
      : Number.isFinite(delta) && delta > 0
        ? "The local model performed better on this small frozen holdout. This is an experiment, not proof of a repeatable edge; keep paper-testing."
        : "This holdout does not show the local ML model beating the simple historical baseline. The model is genuinely trained on past sequence features, but it cannot reveal hidden future outcomes.";
    $("localMLNote").textContent = fit.ready
      ? `Trained locally on ${fit.examples} earlier one-step examples using four prior bands, streak length, rolling band frequencies and recent multiplier summaries. The displayed score is a model score, not a calibrated chance of the next crash.`
      : "The model runs in this browser only; it does not send history to an external AI service.";

    // Use a robust point estimator selected on early data, not a regressor that failed to beat the median baseline.
    const point = pointEstimate || selectAdaptivePointEstimate(vals);
    const distribution = point.distribution || [];
    const distributionNote = $("adaptiveBandWindowNote");
    if (distributionNote) distributionNote.textContent = distribution.length
      ? `Observed frequencies from the latest ${Math.min(point.window,vals.length)} completed rounds. These percentages describe that sample; they are not calibrated odds for the next result.`
      : "Add completed rounds to calculate historical frequencies.";
    for (let k=0;k<4;k++) {
      const item = distribution[k];
      const percent = item ? item.share*100 : 0;
      const valueNode = $(`adaptiveBandP${k}`);
      const barNode = $(`adaptiveBandBar${k}`);
      const intervalNode = $(`adaptiveBandCI${k}`);
      if (valueNode) valueNode.textContent = item && item.sampleSize ? percent.toFixed(1)+"%" : "N/A";
      if (barNode) barNode.style.width = percent.toFixed(1)+"%";
      if (intervalNode) intervalNode.textContent = item && item.sampleSize
        ? `${item.count}/${item.sampleSize} past rounds · 95% sample-share interval ${(item.lower*100).toFixed(1)}–${(item.upper*100).toFixed(1)}%`
        : "Not enough data";
    }
    $("localMLNumericGuess").textContent = Number.isFinite(point.value) ? fmt(point.value) : "N/A";
    $("localMLPointMedianError").textContent = point.ready ? fmt(point.holdoutMedianError) : "N/A";
    $("localMLPointBaselineMedianError").textContent = point.ready ? fmt(point.baselineMedianError) : "N/A";
    $("localMLPointMAE").textContent = point.ready ? fmt(point.holdoutMAE) : "N/A";
    $("localMLPointBaselineMAE").textContent = point.ready ? fmt(point.baselineMAE) : "N/A";
    const medianDelta = point.holdoutMedianError - point.baselineMedianError;
    $("localMLPointDelta").textContent = !point.ready
      ? "Need more validation data"
      : Math.abs(medianDelta) < 0.005
        ? "Tied on this holdout"
        : medianDelta < 0
          ? `${fmt(Math.abs(medianDelta))} lower error`
          : `${fmt(medianDelta)} higher error`;
    $("localMLNumericExplanation").textContent = !point.ready
      ? "Need at least 160 completed rounds to select a lookback window on early chronological forecasts and score it against a later untouched holdout."
      : `Selected the median of the latest ${point.window} rounds using ${point.developmentCount} earlier walk-forward forecasts. On the later holdout (${point.holdoutCount} predictions), median absolute error was ${fmt(point.holdoutMedianError)} versus ${fmt(point.baselineMedianError)} for the rolling-50 baseline; mean absolute error was ${fmt(point.holdoutMAE)} versus ${fmt(point.baselineMAE)}. Any small difference can be sampling noise; this is a robust historical center, not the next hidden crash point.`;
    $("localMLStatus").textContent = !fit.ready
      ? "NEED MORE HISTORY"
      : (testN >= 100 && Number.isFinite(delta) && delta >= 2)
        ? "ML EDGE · UNCONFIRMED"
        : "BASELINE FAVORED";
  }


  function renderRunLengthPanel(vals,run){
    const put=(id,text)=>{const node=$(id);if(node)node.textContent=text;},n=vals.length,d=run.runLengthDistribution||{},base=run.runLengthBaselineDistribution||{},active=n>0;
    put("runLengthCurrentRun",active?run.currentRunLabel+" · open run":"N/A");put("runLengthRecentSequence",active?run.context:"N/A");
    put("runLengthNextClass",active?(run.forecastType==="P"?"P · next round ≥ 2.00x":"B · next round < 2.00x"):"N/A");
    const prob=run.forecastType==="P"?run.probability:1-run.probability,baseProb=run.forecastType==="P"?run.baselineProbability:1-run.baselineProbability;
    put("runLengthNextProbability",active?(prob*100).toFixed(1)+"%":"N/A");put("runLengthNextBaseline",active?(baseProb*100).toFixed(1)+"% for same category":"N/A");
    put("runLengthNextSupport",run.support?run.support+" matches · "+run.depth+"-run context":"No context met 8-match threshold; overall prior used");
    put("runLengthLengthGuess",active?run.runLengthGuess:"N/A");put("runLengthLengthSupport",active?run.runLengthSupport+" eligible runs · "+run.runLengthContextSupport+" contextual match(es)":"N/A");
    for(const cat of ["1","2","3","4+"]){const node=$("runLengthLen"+(cat==="4+"?"4":cat));if(node)node.textContent=active&&Number.isFinite(d[cat])?(100*d[cat]).toFixed(1)+"%":"N/A";const bn=$("runLengthBase"+(cat==="4+"?"4plus":cat));if(bn)bn.textContent=active&&Number.isFinite(base[cat])?"baseline "+(100*base[cat]).toFixed(1)+"%":"";}
    put("runLengthRecentVsOverall",active?"P share · last "+Math.min(50,n)+" rounds: "+(100*run.recentPayRate).toFixed(1)+"%; smoothed overall: "+(100*run.baselineProbability).toFixed(1)+"%":"Need completed rounds.");
    put("runLengthFrequencySummary",run.runLengthFrequencySummary||"No completed runs");const tbody=$("runLengthPatternRows");
    if(tbody){tbody.replaceChildren();const matches=run.patternMatches||[];if(!matches.length){const tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=3;td.className="empty";td.textContent=n<10?"Need more history to form run patterns.":"No historical follow-up matches found.";tr.appendChild(td);tbody.appendChild(tr);}
      else for(const item of matches){const tr=document.createElement("tr");[item.pattern,String(item.matches),item.followSummary+" ("+item.bpSummary+")"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td);});tbody.appendChild(tr);}}
    put("runLengthOosN",run.holdoutN?String(run.holdoutN):"N/A");put("runLengthOosAccuracy",run.holdoutN?(100*run.holdoutAccuracy).toFixed(1)+"%":"N/A");put("runLengthOosBaselineAccuracy",run.holdoutN?(100*run.baselineAccuracy).toFixed(1)+"%":"N/A");
    put("runLengthOosBrier",Number.isFinite(run.brierScore)?run.brierScore.toFixed(3):"N/A");put("runLengthOosBaselineBrier",Number.isFinite(run.baselineBrierScore)?run.baselineBrierScore.toFixed(3):"N/A");
    put("runLengthSupportedCalls",run.holdoutN?run.supportedPredictions+"/"+run.holdoutN+" supported":"N/A");put("runLengthLenN",run.runLengthHoldoutN?String(run.runLengthHoldoutN):"N/A");
    put("runLengthLenAccuracy",run.runLengthHoldoutN?(100*run.runLengthAccuracy).toFixed(1)+"%":"N/A");put("runLengthLenBaselineAccuracy",run.runLengthHoldoutN?(100*run.runLengthBaselineAccuracy).toFixed(1)+"%":"N/A");
    put("runLengthLenSupported",run.runLengthHoldoutN?run.runLengthSupported+"/"+run.runLengthHoldoutN+" with contextual support":"N/A");
    put("runLengthTestNote",!n?"Add completed multipliers to calculate the run-length model.":!run.holdoutN?"Need at least 40 rounds before chronological B/P validation is available.":"Later-30% rolling-origin test ("+run.holdoutN+" rounds): B/P accuracy "+(100*run.holdoutAccuracy).toFixed(1)+"% vs baseline "+(100*run.baselineAccuracy).toFixed(1)+"%; Brier "+run.brierScore.toFixed(3)+" vs "+run.baselineBrierScore.toFixed(3)+" (lower is better). Run-length accuracy "+(run.runLengthHoldoutN?(100*run.runLengthAccuracy).toFixed(1)+"% vs baseline "+(100*run.runLengthBaselineAccuracy).toFixed(1)+"% on "+run.runLengthHoldoutN+" resolved runs":"not yet measurable")+". Unfinished final run is excluded.");
  }

  function renderPatternLearner(vals, pointEstimate) {
    const runPattern=calculateRunLengthSignal(vals);
    const model=calculatePatternGuess(vals,runPattern);
    renderRunLengthPanel(vals,runPattern);
    const point=pointEstimate || selectAdaptivePointEstimate(vals);
    $("patternModelStatus").textContent=model.status;
    $("patternGuessBand").textContent=vals.length?model.names[model.top]:"N/A";
    $("patternGuessMedian").textContent=Number.isFinite(model.bandMedian)?fmt(model.bandMedian):"N/A";
    $("patternGuessMultiplier").textContent=Number.isFinite(point.value)?fmt(point.value):"N/A";
    $("patternGuessConfidence").textContent=vals.length
      ? (point.ready ? `ADAPTIVE · ${point.window} ROUNDS` : `BASELINE · ${point.window} ROUNDS`)
      : "WAITING FOR DATA";
    const numericReason=$("patternNumericReasoning");
    if(numericReason) {
      numericReason.textContent=vals.length
        ? (point.ready
          ? `Point estimate: median of the latest ${point.window} completed rounds, selected on earlier data. It was tested on ${point.holdoutCount} later holdout predictions: median absolute error ${fmt(point.holdoutMedianError)} vs rolling-50 baseline ${fmt(point.baselineMedianError)}; mean absolute error ${fmt(point.holdoutMAE)} vs ${fmt(point.baselineMAE)}. Separately, the sequence model's top-scoring band is ${model.names[model.top]} (${(model.scores[model.top]*100).toFixed(1)} relative score), with recent sequence ${model.recentSequence.join(" → ")} and current streak ${model.currentStreak}. The error difference is not proof of a repeatable edge.`
          : `Estimate: median of the latest ${point.window} completed rounds. More history is needed to select a lookback and test it on later unseen rounds. The sequence model's highest-scoring band is ${model.names[model.top]}, but that relative score is not calibrated odds.`)
        : "Collect completed rounds to calculate an experimental historical estimate.";
    }
    $("patternGuessScore").textContent=vals.length?`${(model.scores[model.top]*100).toFixed(1)}%`:"N/A";
    $("patternMotifHits").textContent=model.motifHits?String(model.motifHits):"0";
    $("patternMotifNote").textContent=model.motifHits?`matching ${model.motifLength}-band motifs`:"No repeated motif with 2+ matches";
    $("patternCurrentStreak").textContent=vals.length?`${model.currentStreak} × ${model.names[model.lastBand]}`:"N/A";
    $("patternRecentSequence").textContent=model.recentSequence.length?model.recentSequence.join(" → "):"N/A";
    $("patternTransitionEvidence").textContent=vals.length
      ?`${model.transitionCount} prior transition(s) after ${model.names[model.lastBand]}`
      :"N/A";
    $("runPatternSequence").textContent=vals.length?runPattern.context:"N/A";
    $("runPatternSignal").textContent=runPattern.signal==="P"?"P · 2x+ lean":runPattern.signal==="B"?"B · below-2x lean":"No clear lean";
    $("runPatternScore").textContent=vals.length?`${(runPattern.probability*100).toFixed(1)}% historical score`:"N/A";
    $("runPatternSupport").textContent=runPattern.support?`${runPattern.support} matching examples · ${runPattern.depth}-run context`:"No run context with 8+ matches";
    $("runPatternValidation").textContent=runPattern.holdoutN?"Later-30% replay ("+runPattern.holdoutN+" rounds): B/P accuracy "+(100*runPattern.holdoutAccuracy).toFixed(1)+"% vs baseline "+(100*runPattern.baselineAccuracy).toFixed(1)+"%; Brier "+runPattern.brierScore.toFixed(3)+" vs "+runPattern.baselineBrierScore.toFixed(3)+". Run-length accuracy "+(runPattern.runLengthHoldoutN?(100*runPattern.runLengthAccuracy).toFixed(1)+"% vs baseline "+(100*runPattern.runLengthBaselineAccuracy).toFixed(1)+"%":"N/A")+".":"Need 40+ rounds for chronological B/P validation.";
    let message=vals.length
      ?`Test-mode guess: ${model.names[model.top]} is the highest-scoring historical band (${(model.scores[model.top]*100).toFixed(1)} relative score). Its within-band historical median is ${fmt(model.bandMedian)}. `
      :"Add completed rounds to calculate pattern features. ";
    if(vals.length<50) message+="There are too few results to assess conditional patterns reliably. ";
    if(model.motifHits>=2) message+=`The latest ${model.motifLength}-band motif has ${model.motifHits} historical match(es), whose following bands help inform the score. `;
    else message+="No repeated 2- or 3-band motif has enough matches to add weight. ";
    if(model.transitionCount>=3) message+=`The current band has ${model.transitionCount} observed historical follow-up(s). `;
    else message+="The current-band transition history is sparse. ";
    message+=` Run-length context: ${runPattern.context}. Historical conditional 2x+ score ${(runPattern.probability*100).toFixed(1)}% versus overall prior ${(runPattern.baselineProbability*100).toFixed(1)}%; signal ${runPattern.signal==="P"?"P (2x+ lean)":runPattern.signal==="B"?"B (below-2x lean)":"neutral"}.`;
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
    const pointEstimate = selectAdaptivePointEstimate(vals);
    renderPaperTracker(pointEstimate);
    $("totalRounds").textContent = n.toLocaleString();
    $("averageValue").textContent = n ? fmt(vals.reduce((a,b)=>a+b,0)/n) : "N/A";
    $("medianValue").textContent = fmt(median(vals));
    $("belowTwoValue").textContent = n ? pct(vals.filter(v=>v<2).length,n) : "N/A";
    renderPatternStats(vals);
    // Refresh the local pattern learner and ML diagnostics whenever saved history changes.
    // All features use only previously completed rounds; scores are experimental, not calibrated odds.
    renderPatternLearner(vals,pointEstimate);
    renderLocalML(vals,pointEstimate);
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
    error.hidden=true;const observedTimestamp=new Date().toISOString();settlePaperOnLiveResult(val,observedTimestamp);rounds.push({multiplier:val,timestamp:observedTimestamp});saveHistory();render();input.value="";input.focus();resetAnalysis("Round added. B/P run-length model and paper test refreshed.");
  });
  $("analyzeButton").addEventListener("click",analyze);
  $("pfVerifierForm").addEventListener("submit", verifyCompletedRound);
  $("pfClearButton").addEventListener("click", () => {
    $("pfVerifierForm").reset();
    resetVerifierOutput();
  });
  $("paperStartButton").addEventListener("click",()=>{
    if (paperState.active && paperState.pending) {
      paperState.lastMessage = "A guess is already locked. Wait for a new single-result sync, or pause the test; this locked estimate cannot be overwritten.";
      savePaperState();
      renderPaperTracker();
      return;
    }
    paperState.active = true;
    paperState.pending = makePaperForecast(values());
    paperState.lastMessage = paperState.pending
      ? "Paper test started. This estimate is locked for the next single newly synced result and cannot be refreshed while pending."
      : "Cannot lock a guess until there is usable history.";
    savePaperState();
    renderPaperTracker();
  });
  $("paperPauseButton").addEventListener("click",()=>{
    paperState.active = false;
    paperState.pending = null;
    paperState.pendingRunForecasts = [];
    paperState.lastMessage = "Paper test paused. Unresolved run lengths remain unscored.";
    savePaperState();
    renderPaperTracker();
  });

  $("paperExportButton").addEventListener("click",()=>{
    if(!paperState.results.length){alert("No paper-test scores yet. Start the test and wait for a new single-round sync.");return;}
    const headers=["test_round","guess_created_at","observed_at","sample_size","forecast_version","pattern_version","run_length_version","guess_window_rounds","model_guess","actual_multiplier","model_abs_error","rolling50_median_guess","baseline_abs_error","model_band","actual_band","band_hit","within_0_25x","run_signal","run_score_at_least_2x","run_baseline_2x_share","run_context","run_context_support","run_signal_hit","bp_forecast","bp_probability_P","bp_baseline_probability_P","bp_actual","bp_hit","bp_brier","bp_baseline_hit","bp_baseline_brier","run_current_type","run_current_length","run_length_category_guess","run_length_distribution_json","run_length_actual_length","run_length_actual_category","run_length_hit","run_length_baseline_hit"];
    const rows=[headers,...paperState.results.map((r,i)=>[i+1,r.guessCreatedAt,r.observedAt,r.sampleSize,r.modelVersion||"legacy_rolling50",r.patternVersion||"",r.runLengthVersion||"",r.guessWindow||50,r.guess,r.actual,r.absError,r.baselineGuess,r.baselineAbsError,r.guessBand,r.actualBand,r.bandHit,r.nearHit,r.runSignal||"",r.runPatternScore,r.runPatternBaseline,r.runPatternContext||"",r.runPatternSupport||0,r.runSignalHit,r.bpForecast||"",r.bpProbability,r.bpBaselineProbability,r.bpActual||"",r.bpHit,r.bpBrier,r.bpBaselineHit,r.bpBaselineBrier,r.runCurrentType||"",r.runCurrentLength||"",r.runLengthCategoryGuess||"",JSON.stringify(r.runLengthDistribution||{}),r.runLengthActualLength||"",r.runLengthActualCategory||"",r.runLengthHit,r.runLengthBaselineHit])];
    const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="aviator-paper-test.csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  });

  $("paperResetButton").addEventListener("click",()=>{
    if(!confirm("Reset only the paper-test guesses and scores? Your round history will not be deleted.")) return;
    paperState = {active:false,pending:null,results:[],skipped:0,lastMessage:"Paper-test log reset. Start again to record fresh guesses."};
    savePaperState();
    renderPaperTracker();
  });

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
  // First visit: start a NO-STAKE paper test automatically when usable history exists.
  // An explicit Pause or Reset message prevents auto-restarting on refresh.
  if (!paperState.active && !paperState.pending && !paperState.lastMessage && rounds.length >= 35) {
    paperState.active = true;
    paperState.pending = makePaperForecast(values());
    paperState.lastMessage = paperState.pending
      ? "Automatic no-stake paper test started. The first estimate was locked before the next newly synced single result."
      : "History is loaded, but the model could not produce a valid estimate yet.";
    savePaperState();
  }
  render();
  if(rounds.length) analyze();
})();
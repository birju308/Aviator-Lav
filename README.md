# Aviator Lab

Static GitHub Pages historical-results analyzer with optional browser-local sync from the Aviator Lab Chrome extension.

## Live local sync

- Install the Aviator Lab Visible Result Collector extension (unpacked, from its provided ZIP).
- Keep the Crorebet Aviator tab open in Chrome. The extension observes visible result-history DOM elements in accessible game frames and stores newly detected rounds in Chrome extension storage.
- Open this GitHub Pages site in the same Chrome profile. The extension syncs newly collected rounds into this site's local browser storage automatically, about every few seconds.
- This sync is local to the same browser/profile. It is not a cloud database; another device/browser will not see the same local history.
- Keep the game tab and Chrome running for collection. If the browser is closed, the extension cannot collect new rounds.

The current imported history is retained. Automatically collected items have stable extension IDs so repeated sync checks do not re-add the same extension record. New round timestamps indicate when the browser observed the result, not an operator-verified round timestamp.

## Install GitHub Pages

1. Repository files are in the root.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch `main`, folder `/(root)`, and save.
5. Wait for Pages to publish the latest commit.

## Limitations

The extension reads visible page DOM only. It may miss inaccessible cross-origin frames, canvas-only results, or layout changes. Verify data quality and do not treat statistical summaries as betting advice. The next crash time/multiplier cannot be reliably predicted from prior rounds; the displayed median is a historical reference, not a forecast.


## Adaptive historical model

The page includes an experimental frequency explorer that refreshes when the saved history changes. It smooths the full-sample frequency with the last 50 saved entries and shows four outcome bands. This is a descriptive baseline—not a validated AI predictor—and should not be treated as a forecast of the next independent crash outcome.

## Cleaning collector duplicates

The **Remove auto-synced results (N)** button removes only records tagged as Chrome-extension syncs, while keeping manually entered and CSV-imported records. Remove older duplicate collector extensions from Chrome and keep only one version enabled before continuing automatic collection.


## Experimental crash predictor

The UI ranks four multiplier bands using a smoothed blend of full-sample frequency and the latest 50 saved results. It also runs a walk-forward diagnostic: each historical test uses only earlier results, then compares the selected band with a simple most-common-band baseline. With small samples the test is noisy and should not be interpreted as predictive skill. These are historical frequency summaries, not calibrated future odds or an exact crash prediction.

Keep collection data clean: multiple collector extension versions can cause duplicates. Remove old collector versions and use the website's auto-synced-results cleanup button if necessary.


## Experimental candidate model comparison

The predictor compares a smoothed full-history blend, a recent-25 majority, a last-band transition candidate, a decay-weighted frequency candidate, and a most-common-band baseline using chronological walk-forward tests. For each test, the predictor uses only earlier observations. The dashboard reports a separate verdict: small samples are marked insufficient; a candidate performance difference is unconfirmed and can be due to trying multiple methods against the same history. Nothing here predicts an exact future crash multiplier/time or supplies betting advice.


## Untouched holdout validation

The experimental predictor now separates chronological development results from a final, later holdout. It chooses one candidate using only the development window, then evaluates that selected candidate against the baseline on the reserved holdout. Small holdouts show an insufficient-sample verdict. Even a positive holdout result is exploratory—not proof of future accuracy—because random outcomes and small samples can fluctuate.

The model predicts multiplier *bands*, not exact multiplier/time.


## Pattern learner (experimental test mode)

The predictor includes an explainable sequence model that blends full-sample and recent band frequencies with observed next-band transitions, repeated 2–3 band motifs, and matching run-length contexts when enough past examples exist. It displays a top-ranked outcome band, the historical median among saved values in that band, the current band streak, recent band sequence, and the amount of matching historical evidence. A separate chronological walk-forward evaluation compares this candidate with simple baselines and reserves a later holdout.

All displayed percentages are model-relative scores, not calibrated real-world probabilities. This is a test-mode pattern model and not a validated predictor for independently randomized rounds; it does not reveal the hidden result or estimate a reliable exact crash time/multiplier.


## Single-number pattern guess (experimental)

The pattern learner displays a test-mode numeric point guess (e.g. 1.49x or 2.00x) for usability. It prefers the median multiplier observed after matching historical 2–3 band sequences when there are at least three examples; otherwise it falls back to the recent matching-band median or the overall selected-band median. The UI shows which evidence source was used and labels confidence low. This is a historical analogy for test mode, not a calibrated probability, not a forecast derived from hidden round inputs, and not a reliable exact crash prediction.


## Live paper-test accuracy tracker

The site now has a no-stake tracker. Click **Start paper test** to lock a numeric guess based on currently saved history for the next newly synced round. If exactly one new round arrives, it records the actual, band hit/miss, absolute numeric error, and then locks a fresh forecast. If several results arrive in one batch, it does not guess their alignment; it skips scoring that batch. The tracker is local to the browser and can be paused or reset independently from round history.

This evaluates the forecast, it does not improve or guarantee it. Do not use an unvalidated guess for real-money betting. A random crash outcome cannot be reliably inferred from historical patterns alone.


## Local supervised ML experiment

The page now includes a small multinomial logistic-regression classifier trained in the browser on earlier multiplier-band sequences, streak length, rolling band frequencies and recent multiplier summaries. Its weights are learned from past one-step examples; it is not a hosted LLM and no results are sent to an external AI service. The classifier shows a frozen chronological holdout score against a simple same-round baseline. Scores are exploratory and uncalibrated. If the classifier does not beat the baseline on future unseen rounds, do not treat it as useful predictive signal. The exact upcoming crash point cannot be reliably inferred from previous outcomes alone.

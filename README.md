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

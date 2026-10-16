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


## Current visible features

The visible site focuses on completed-round statistics and a local Provably Fair verifier. Numeric next-round guesses and machine-learning prediction cards are hidden, and the old paper-prediction logging is paused, because previous tests did not establish predictive edge over simple historical baselines.

## Completed-round Provably Fair verifier

The verifier accepts a revealed server seed, the first three client seeds shown in the completed-round panel, the combined SHA-512 hash, and the displayed multiplier. With **Aviator Lab Auto Collector v0.12**, opening the game's visible completed-round fairness panel automatically captures those values from accessible page text and fills the verifier in the same Chrome profile; no manual seed copy is needed. If the game panel's DOM is inaccessible or changes layout, use the manual fields.

It concatenates the four seed strings in panel order without separators and recomputes SHA-512 using the browser's Web Crypto API. It separately derives the 52-bit prefix and multiplier with a common 97%-RTP reference formula and optionally checks the SHA-256 commitment of the revealed server seed against a pre-round commitment supplied for that same round.

All calculations happen locally in the browser; seed inputs are not posted to an API or saved in round history. The hash comparison is the primary integrity check. The multiplier mapping is a public reference reconstruction, not a claim to reproduce unpublished operator source code. If the reference multiplier differs while the hash matches, do not conclude manipulation from that difference alone.

Official background: [SPRIBE Provably Fair](https://spribe.co/provably-fair).

## Limitations

The optional Chrome extension only reads visible result-history DOM content and may miss inaccessible frames or canvas-only results. Historical statistics describe past data only. A completed-round verifier checks disclosed inputs after a round finishes; neither the history analyzer nor the verifier predicts the next hidden outcome. Do not use this site as a betting signal.

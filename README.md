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

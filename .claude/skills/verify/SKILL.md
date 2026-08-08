---
name: verify
description: Drive Word Worm's real gameplay (tile swipe, word validation, scoring) end-to-end against the deployed test site, for verifying changes to game.js's grid/canvas/Trie code.
---

# Verifying Word Worm gameplay changes

This is a browser game with no local dev server config checked in — the
fastest reliable way to verify a change to grid/swipe/Trie/scoring logic is
to deploy to the **test** Firebase project and drive the live page with
Playwright (`playwright` is already a devDependency).

## Recipe

1. Sync + deploy to test (never prod):
   ```bash
   npm run sync:ios   # only needed if the change also touches the iOS bundle
   firebase deploy --only hosting,firestore:rules
   ```
   `npm run build` runs automatically as hosting's predeploy hook and bumps
   the cache-busting `?v=` on game.js/CSS — deploying is enough, no separate
   version bump needed. Confirm `.firebaserc`'s default project is the test
   project before deploying (it is, by design — see CLAUDE.md).

2. Write a throwaway Playwright script. It must run from inside the repo
   (Node resolves `require('playwright')` from the requiring file's own
   directory) — put it in `tests/e2e/_tmp-*.js` temporarily, run it, then
   delete it; don't leave scratch scripts in the tracked test directory.

3. Useful patterns for this codebase specifically:
   - `BASE_URL` defaults to `https://wordworm-test-c7f3a.web.app`. Refuse to
     run if it looks like prod (see the guard at the top of any
     `tests/e2e/*.test.js` file) if the script writes real data.
   - After `page.goto`, wait for `#mode-timed-btn` then ~6s for anonymous
     auth + the two dictionary JSON fetches to finish before clicking
     anything — the Play buttons are disabled until `loadAssets()` resolves.
   - Reading the live board: `page.$$eval('#grid .tile', tiles =>
     tiles.map(t => t.dataset.letter))`. Tile index in the DOM matches
     `tileIndex` in `findWordsRecursive`/`solveBoard` (row-major, 4 cols).
   - To swipe a *real* word (not just adjacent tiles): solve the live board
     against `assets/scrabble-dictionary.json` yourself in the script (same
     adjacency rules as `findWordsRecursive` in game.js — copy the DFS, it's
     ~15 lines), pick a path, then get real pixel centers via
     `tiles[i].getBoundingClientRect()` and drive `page.mouse.move/down/up`
     through them like a finger would. This is what actually exercises
     `cacheTilePositions()`/`drawLines()`/`getTileCenter()` and the live
     `Trie` instance built from the fetched JSON — not a reimplementation.
   - To confirm the canvas line actually rendered (not just that
     `.tile.selected` classes toggled): read `#line-canvas`'s pixel data via
     `ctx.getImageData(...)` inside `page.evaluate` and check for any
     non-zero alpha byte. A mid-drag `page.screenshot()` is the best single
     piece of evidence to look at directly — the line should visibly connect
     the swiped tiles in the exact zigzag of the path.
   - Score before/after: `page.textContent('#score')`.

4. Clean up: `rm tests/e2e/_tmp-*.js` when done. Deploying to test is cheap
   and fine to repeat.

## Known pre-existing quirk (not a regression to chase)

Standard/Quick Play mode does not block re-scoring the same word twice in
one game (unlike Daily mode, which checks `foundWords.some(fw => fw.word
=== word)`). Re-swiping an already-found word in Standard mode adds to the
score again. Confirmed via this recipe on 2026-08-07 — worth knowing so a
"score increased on repeat swipe" observation during verification isn't
mistaken for a bug in whatever you're actually testing.

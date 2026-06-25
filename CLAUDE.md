# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Word Worm is a browser-based word-finding game deployed on Firebase Hosting at `wordwormgame.com`. Players swipe connected letters on a 4×4 grid to form words against a 60-second timer. There are two modes: **Standard** (randomly generated board with leaderboard) and **Daily Challenge** (deterministic seeded board fetched from Firestore).

## Commands

### CSS Build
```bash
npm run build   # Compiles src/input.css → dist/style.css via Tailwind (minified)
```
`index.html` loads both `./dist/style.css` (Tailwind) and `style.css` (custom).

### Firebase Functions
From the `functions/` directory:
```bash
npm run serve   # Start local emulator (functions only)
npm run deploy  # Deploy Cloud Functions to Firebase
npm run logs    # Tail function logs
```

### Dictionary Utilities (run once with Node.js)
```bash
node build_dictionary.js        # Fetches Scrabble word list, builds Trie → assets/scrabble-dictionary.json
node build_common_dictionary.js # Intersects common words with Scrabble dict → assets/common-dictionary.json
node clean-dictionary.js        # Additional cleaning pass
```

### Deploy Hosting
```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy  # Full deploy
```

## Architecture

### Frontend (`index.html` + `game.js`)
- Single-page app — all game logic lives in `game.js` (ES module, loaded with `defer`).
- Firebase JS SDK v11 loaded via CDN (`gstatic.com`), not npm. Auth, Firestore, and Analytics are imported at the top of `game.js`.
- Anonymous Firebase Auth is used to identify players persistently across sessions.
- `currentGamemode` state variable (`'standard'`, `'daily'`, `'practice'`) controls all branching throughout the game loop.

**Key state in `game.js`:**
- `validationTrie` / `fullDictionaryTrie` — Trie instances loaded from `assets/common-dictionary.json` and `assets/scrabble-dictionary.json` at startup via `loadAssets()`.
- `dailyChallengeData` / `allDailyWords` — populated from Firestore `dailyPuzzles/{date}` doc or falls back to the local seeded `createDailyChallengeBoard()`.
- `selectedTiles`, `foundWords`, `score`, `timer` — live game state.

**Game flow:** `main()` → `showWelcomeScreen()` + `loadAssets()` → `startGame()` → `endGame()` / `endDailyChallenge()`.

### Backend (`functions/index.js`)
Two scheduled Cloud Functions (Firebase Functions v2, Node 22):
- `generateDailyPuzzle` — runs daily at midnight ET; generates a quality-checked board and writes it to Firestore `dailyPuzzles/{YYYY-MM-DD}`.
- `resetDailyLeaderboards` — runs daily at midnight ET; resets `leaderboards/daily` (timed mode, 3-category) and `leaderboards/dailyChallenge` (simple top scores).

### Firestore Collections
- `dailyPuzzles/{date}` — board array, allWords array, bonuses, createdAt
- `leaderboards/daily` — `{topByHighScore, topByTotalScore, topByBestWord, date}`
- `leaderboards/dailyChallenge` — `{topScores, date}`
- `players/{userId}/dailyChallenges/{date}` — per-player daily completion records

### Dictionary / Trie
Words are stored as pre-built JSON Trie trees. Two dictionaries:
- **Scrabble** (`assets/scrabble-dictionary.json`, `functions/scrabble-dictionary.json`) — full valid word list, used for word validation.
- **Common** (`assets/common-dictionary.json`, `functions/common-dictionary.json`) — intersection of Scrabble words with a 20k common-word list, used for board quality checks (must have ≥30 common words).

The Trie `search(word, isPrefix)` method is duplicated in `game.js` and `functions/index.js` — keep them in sync if modified.

### Board Generation
Both `createDailyChallengeBoard()` (client, seeded PRNG) and `generateDailyPuzzle` (Cloud Function, random) apply the same quality rules:
- 4–8 vowels, ≤2 hard consonants (J/K/Q/X/Z)
- Q must be adjacent to U
- No 2×2 clumps of all-vowels or all-consonants
- ≥30 common words findable, ≤60 total words

### CSS
Tailwind utility classes are used in `index.html`. Custom styles (animations, game-specific) are in `style.css`. Build pipeline: `src/input.css` → `dist/style.css`.

## Firebase Projects
- Default/test project: `wordworm-test-c7f3a`
- Production site: `wordwormgame.com`

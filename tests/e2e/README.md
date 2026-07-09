# End-to-end tests

Playwright scripts that drive the deployed **test site** (`wordworm-test-c7f3a.web.app`)
like a real player. They are plain node scripts, not a test-runner suite:

```bash
node tests/e2e/guest-first-game.test.js     # guest plays, names self at the end-game
                                            # prompt, score must reach the leaderboard
node tests/e2e/daily-normal.test.js         # daily puzzle loads fast, no fallback
node tests/e2e/daily-fallback.test.js       # daily puzzle outage fallback (manual setup!)
node tests/e2e/config-selection.test.js <url>  # which Firebase project a page talks to
```

Override the target site with `BASE_URL=https://... node tests/e2e/<name>.js`.
Never point these at production: they create anonymous accounts, claim throwaway
usernames, and post real scores to whatever project the page is configured for.
The three gameplay tests refuse to run if `BASE_URL` looks like production
(`wordwormgame.com` / `word-rush-game-9010a`); only `config-selection.test.js`
may target prod — it's read-only by design.

`guest-first-game.test.js` takes ~90s (it waits out a full 60s game timer).

**daily-fallback.test.js needs manual setup**: delete today's doc (NY date) from
the test project's `dailyPuzzles` collection first, then run the script, then
restore by force-running the generator job:

```bash
gcloud scheduler jobs run firebase-schedule-generateDailyPuzzle-us-central1 \
  --project wordworm-test-c7f3a --location us-central1
```

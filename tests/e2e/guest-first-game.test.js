// A fresh guest (no saved name — e.g. private browsing) plays a timed game to
// the end, gets the after-game name prompt, and submits a name. The game they
// just played must be posted to the daily leaderboard retroactively, and the
// leaderboard modal must show it immediately (regression tests for the "Kyle"
// bug and the stale 60s leaderboard-HTML-cache bug).
//
// Also deliberately views the leaderboard BEFORE submitting the name, so the
// stale board (without this player) lands in the HTML cache — the fix must
// invalidate it when the score posts.
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'https://wordworm-test-c7f3a.web.app';

// This test writes real data to whatever project the page talks to: it plays
// a game, posts a score to the daily/all-time leaderboards, and permanently
// claims a throwaway username. Never let it near production.
if (/wordwormgame\.com|word-rush-game-9010a/i.test(BASE_URL)) {
    console.error('Refusing to run against production (' + BASE_URL + ') — this test writes scores and claims usernames. Point BASE_URL at the test site.');
    process.exit(1);
}

(async () => {
    const name = 'e2e' + Date.now().toString().slice(-9); // fits 15-char username rules
    console.log(`Site: ${BASE_URL}  |  test username: ${name}`);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', m => { if (m.type() === 'error') console.log('[page error]', m.text().slice(0, 200)); });

    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForSelector('#mode-timed-btn', { timeout: 20000 });
    await page.waitForTimeout(6000); // anonymous auth + dictionary load

    await page.click('#mode-timed-btn');
    console.log('Game started, waiting 65s for the timer to expire...');
    await page.waitForTimeout(65000);

    await page.waitForSelector('#endgame-name-input', { timeout: 15000 });
    console.log('Name prompt appeared (guest with no saved name)');

    // Poison the HTML cache with a pre-submit board render.
    await page.click('#endgame-leaderboard-button');
    await page.waitForTimeout(3000);
    const staleBoard = await page.textContent('#leaderboard-list-simple');
    console.log('Pre-submit board cached (contains us? '
        + staleBoard.toLowerCase().includes(name.toLowerCase()) + ' — expected false)');
    await page.click('#close-leaderboard-button');

    await page.fill('#endgame-name-input', name);
    await page.click('#endgame-name-submit');

    // The rank/percentile/submitted message only paints after the retroactive
    // leaderboard post resolves.
    await page.waitForFunction(() => {
        const el = document.getElementById('submission-container');
        const t = el ? el.textContent || '' : '';
        return t.includes('leaderboard') || t.includes('placed above') || t.includes('submitted');
    }, { timeout: 30000 });
    console.log('Submission message:', (await page.textContent('#submission-container')).trim());

    // Reopen the board — the cache must have been invalidated by the post.
    await page.click('#endgame-leaderboard-button');
    await page.waitForTimeout(1000);
    await page.click('#daily-tab');
    await page.waitForTimeout(4000);
    const board = await page.textContent('#leaderboard-list-simple');
    const onBoard = board.toLowerCase().includes(name.toLowerCase());
    console.log(onBoard ? `PASS: "${name}" is on the daily leaderboard` : `FAIL: "${name}" NOT on the board`);
    if (!onBoard) console.log('Board contents:', board.slice(0, 500));

    await browser.close();
    process.exit(onBoard ? 0 : 1);
})().catch(e => { console.error('E2E test error:', e.message); process.exit(1); });

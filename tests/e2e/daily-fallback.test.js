// Outage path: with today's dailyPuzzles doc DELETED (see README for the
// manual setup/restore steps), Daily mode must still load by falling back to
// the most recent published puzzle.
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'https://wordworm-test-c7f3a.web.app';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const warnings = [];
    page.on('console', m => { if (m.text().includes('falling back')) warnings.push(m.text()); });

    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForSelector('#mode-timed-btn', { timeout: 20000 });
    await page.waitForTimeout(6000); // anonymous auth + dictionary load

    console.log("Clicking Daily Puzzle (today's doc must be deleted for this test)...");
    await page.click('#mode-daily-btn');

    // 10s retry window + fallback query — allow 30s total.
    await page.waitForSelector('#daily-grid .tile', { timeout: 30000 });
    const tiles = await page.locator('#daily-grid .tile').count();
    const wordCount = await page.textContent('#daily-word-count');
    console.log(`Board loaded: ${tiles} tiles, word counter "${wordCount.trim()}"`);
    console.log('Fallback warning:', warnings.length ? warnings[0] : '(none captured — was today\'s doc really deleted?)');

    const pass = tiles === 16 && warnings.length > 0;
    console.log(pass ? 'PASS: Daily mode playable during outage via fallback' : 'FAIL');
    await browser.close();
    process.exit(pass ? 0 : 1);
})().catch(e => { console.error('E2E test error:', e.message); process.exit(1); });

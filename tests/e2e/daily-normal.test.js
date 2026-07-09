// Happy path: today's dailyPuzzles doc exists — the Daily Puzzle must load
// quickly and WITHOUT the missing-puzzle fallback kicking in.
const { chromium } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'https://wordworm-test-c7f3a.web.app';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    let usedFallback = false;
    page.on('console', m => { if (m.text().includes('falling back')) usedFallback = true; });

    await page.goto(BASE_URL, { waitUntil: 'load' });
    await page.waitForSelector('#mode-timed-btn', { timeout: 20000 });
    await page.waitForTimeout(6000); // anonymous auth + dictionary load

    const t0 = Date.now();
    await page.click('#mode-daily-btn');
    await page.waitForSelector('#daily-grid .tile', { timeout: 15000 });
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const tiles = await page.locator('#daily-grid .tile').count();
    console.log(`Board loaded in ${elapsed}s, ${tiles} tiles, usedFallback=${usedFallback}`);

    const pass = tiles === 16 && !usedFallback;
    console.log(pass ? 'PASS: normal daily load, no fallback' : 'FAIL');
    await browser.close();
    process.exit(pass ? 0 : 1);
})().catch(e => { console.error('E2E test error:', e.message); process.exit(1); });

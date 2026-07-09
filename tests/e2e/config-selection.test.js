// Loads a page and reports which Firebase project its auth/Firestore traffic
// targets — guards the hostname-based config selection in game.js. Read-only:
// a page load performs anonymous auth and a few reads, no game is played.
//
//   node tests/e2e/config-selection.test.js https://wordworm-test-c7f3a.web.app   # expect TEST
//   node tests/e2e/config-selection.test.js https://wordwormgame.com              # expect PROD
const { chromium } = require('playwright');

(async () => {
    const url = process.argv[2];
    if (!url) { console.error('Usage: node config-selection.test.js <url>'); process.exit(1); }
    const expectProd = url.includes('wordwormgame.com') || url.includes('word-rush-game-9010a');
    const hits = { prod: 0, test: 0 };

    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('request', r => {
        const u = r.url();
        if (u.includes('googleapis.com')) {
            if (u.includes('word-rush-game-9010a')) hits.prod++;
            if (u.includes('wordworm-test-c7f3a')) hits.test++;
        }
    });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(8000);
    console.log(`${url}\n  requests to PROD project: ${hits.prod}\n  requests to TEST project: ${hits.test}`);

    const pass = expectProd ? (hits.prod > 0 && hits.test === 0) : (hits.test > 0 && hits.prod === 0);
    console.log(pass ? `PASS: page talks only to the ${expectProd ? 'PROD' : 'TEST'} project` : 'FAIL: wrong or mixed project traffic');
    await browser.close();
    process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e.message); process.exit(1); });
